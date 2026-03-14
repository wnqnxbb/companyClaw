import fs from "node:fs/promises";
import path from "node:path";
import type { RuntimeConfig, RuntimeSession } from "./types.js";

type LogPayload = Record<string, unknown>;

type TraceRecord = {
  ts: string;
  runId: string;
  type: string;
} & LogPayload;

export class RunLogger {
  readonly filePath: string;
  private readonly consoleEnabled: boolean;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(filePath: string, consoleEnabled: boolean) {
    this.filePath = filePath;
    this.consoleEnabled = consoleEnabled;
  }

  async init(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
  }

  log(type: string, payload: LogPayload): Promise<void> {
    const record: TraceRecord = {
      ts: new Date().toISOString(),
      runId: String(payload.runId),
      type,
      ...payload,
    };
    const line = `${JSON.stringify(record)}\n`;
    this.writeChain = this.writeChain.then(async () => {
      await fs.appendFile(this.filePath, line, "utf8");
      if (this.consoleEnabled) {
        renderTraceToConsole(record);
      }
    });
    return this.writeChain;
  }

  async close(): Promise<void> {
    await this.writeChain;
  }
}

function renderTraceToConsole(record: TraceRecord): void {
  const prefix = `[trace:${record.type}]`;
  if (record.type === "prompt.system" || record.type === "prompt.user") {
    const text = typeof record.text === "string" ? record.text : "";
    process.stderr.write(`${prefix}\n${text}\n`);
    return;
  }
  if (record.type === "llm.request") {
    process.stderr.write(
      `${prefix} ${String(record.provider ?? "")}/${String(record.model ?? "")}\n`,
    );
    if (typeof record.systemPrompt === "string") {
      process.stderr.write(`systemPrompt:\n${record.systemPrompt}\n`);
    }
    if (record.messages !== undefined) {
      process.stderr.write(`messages:\n${JSON.stringify(record.messages, null, 2)}\n`);
    }
    return;
  }
  if (record.type === "assistant.delta") {
    process.stderr.write(`${prefix} ${String(record.delta ?? "")}\n`);
    return;
  }
  process.stderr.write(`${prefix} ${JSON.stringify(record)}\n`);
}

export async function createRunLogger(params: {
  config: RuntimeConfig;
  runId: string;
  consoleEnabled: boolean;
}): Promise<RunLogger | null> {
  if (!params.config.runtime.observability.enabled) {
    return null;
  }
  const logDir = path.resolve(params.config.stateDir, params.config.runtime.observability.logDir);
  const filePath = path.join(logDir, "runs", `${params.runId}.jsonl`);
  const logger = new RunLogger(filePath, params.consoleEnabled);
  await logger.init();
  return logger;
}

function normalizeAssistantText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((block) => {
      if (!block || typeof block !== "object") {
        return "";
      }
      const typed = block as { type?: unknown; text?: unknown };
      return typed.type === "text" && typeof typed.text === "string" ? typed.text : "";
    })
    .join("");
}

function serializeUnknown(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function wrapStreamWithLogging(params: {
  stream: {
    [Symbol.asyncIterator](): AsyncIterator<unknown>;
    result(): Promise<unknown>;
  };
  logger: RunLogger;
  runId: string;
  includeAssistantDeltas: boolean;
  modelInfo: { provider?: string; model?: string };
}) {
  const baseStream = params.stream;
  return {
    async *[Symbol.asyncIterator]() {
      for await (const event of baseStream) {
        const typed = event as { type?: string; delta?: string; reason?: string; error?: unknown };
        if (
          params.includeAssistantDeltas &&
          typed?.type === "text_delta" &&
          typeof typed.delta === "string"
        ) {
          await params.logger.log("assistant.delta", {
            runId: params.runId,
            provider: params.modelInfo.provider,
            model: params.modelInfo.model,
            delta: typed.delta,
          });
        }
        if (typed?.type === "error") {
          await params.logger.log("llm.error", {
            runId: params.runId,
            provider: params.modelInfo.provider,
            model: params.modelInfo.model,
            error: serializeUnknown(typed.error),
          });
        }
        if (typed?.type === "done") {
          await params.logger.log("llm.done", {
            runId: params.runId,
            provider: params.modelInfo.provider,
            model: params.modelInfo.model,
            reason: typed.reason,
          });
        }
        yield event;
      }
    },
    async result() {
      const result = await baseStream.result();
      await params.logger.log("assistant.final", {
        runId: params.runId,
        provider: params.modelInfo.provider,
        model: params.modelInfo.model,
        text: normalizeAssistantText((result as { content?: unknown }).content),
        message: serializeUnknown(result),
      });
      return result;
    },
  };
}

export function attachSessionObservability(params: {
  session: RuntimeSession;
  logger: RunLogger | null;
  runId: string;
  config: RuntimeConfig;
  selectedModel: { provider: string; id: string };
}): () => void {
  if (!params.logger) {
    return () => {};
  }

  const unsubscribers: Array<() => void> = [];
  if (typeof params.session.subscribe === "function") {
    const unsubscribe = params.session.subscribe((event) => {
      const typed = event as {
        type?: string;
        toolCallId?: string;
        toolName?: string;
        args?: unknown;
        result?: unknown;
        isError?: boolean;
        errorMessage?: string;
      };
      if (typed.type === "tool_execution_start") {
        void params.logger?.log("tool.start", {
          runId: params.runId,
          toolCallId: typed.toolCallId,
          toolName: typed.toolName,
          args: params.config.runtime.observability.includeToolArgs
            ? serializeUnknown(typed.args)
            : undefined,
        });
      }
      if (typed.type === "tool_execution_end") {
        void params.logger?.log("tool.end", {
          runId: params.runId,
          toolCallId: typed.toolCallId,
          toolName: typed.toolName,
          isError: typed.isError === true,
          result:
            params.config.runtime.observability.includeToolResults
              ? serializeUnknown(typed.result)
              : undefined,
          errorMessage: typed.errorMessage,
        });
      }
      if (typed.type === "auto_compaction_start" || typed.type === "auto_compaction_end") {
        void params.logger?.log(`session.${typed.type}`, {
          runId: params.runId,
          event: serializeUnknown(event),
        });
      }
    });
    unsubscribers.push(unsubscribe);
  }

  const agent = params.session.agent as {
    streamFn?: (model: unknown, context: unknown, options?: unknown) => Promise<unknown> | unknown;
    __companyclawTraceWrapped?: boolean;
  };

  if (typeof agent.streamFn === "function" && agent.__companyclawTraceWrapped !== true) {
    const baseStreamFn = agent.streamFn;
    agent.streamFn = async (model: unknown, context: unknown, options?: unknown) => {
      const ctx = context as { systemPrompt?: unknown; messages?: unknown };
      if (params.config.runtime.observability.includeLlmRequests) {
        await params.logger?.log("llm.request", {
          runId: params.runId,
          provider:
            (model as { provider?: string })?.provider ?? params.selectedModel.provider,
          model: (model as { id?: string })?.id ?? params.selectedModel.id,
          systemPrompt:
            params.config.runtime.observability.includePrompts &&
            typeof ctx?.systemPrompt === "string"
              ? ctx.systemPrompt
              : undefined,
          messages: serializeUnknown(ctx?.messages),
          options: serializeUnknown(options),
        });
      }
      const stream = (await baseStreamFn(model, context, options)) as {
        [Symbol.asyncIterator](): AsyncIterator<unknown>;
        result(): Promise<unknown>;
      };
      return wrapStreamWithLogging({
        stream,
        logger: params.logger as RunLogger,
        runId: params.runId,
        includeAssistantDeltas: params.config.runtime.observability.includeAssistantDeltas,
        modelInfo: {
          provider: (model as { provider?: string })?.provider ?? params.selectedModel.provider,
          model: (model as { id?: string })?.id ?? params.selectedModel.id,
        },
      });
    };
    agent.__companyclawTraceWrapped = true;
  }

  return () => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  };
}
