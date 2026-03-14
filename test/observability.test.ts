import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { runAgent } from "../src/runtime.js";
import type { RuntimeConfig, RuntimeSdk, RuntimeSession, RuntimeSessionManager } from "../src/types.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
  delete process.env.OPENAI_API_KEY;
});

function createFakeAssistantStream() {
  const result = {
    role: "assistant",
    content: [{ type: "text", text: "stream hello" }],
    stopReason: "stop",
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
  };

  return {
    async *[Symbol.asyncIterator]() {
      yield {
        type: "text_start",
        contentIndex: 0,
        partial: { role: "assistant", content: [{ type: "text", text: "" }] },
      };
      yield {
        type: "text_delta",
        contentIndex: 0,
        delta: "stream ",
        partial: { role: "assistant", content: [{ type: "text", text: "stream " }] },
      };
      yield {
        type: "text_delta",
        contentIndex: 0,
        delta: "hello",
        partial: { role: "assistant", content: [{ type: "text", text: "stream hello" }] },
      };
      yield {
        type: "text_end",
        contentIndex: 0,
        content: "stream hello",
        partial: { role: "assistant", content: [{ type: "text", text: "stream hello" }] },
      };
      yield {
        type: "done",
        reason: "stop",
        message: result,
      };
    },
    async result() {
      return result;
    },
  };
}

function createFakeSdk(): RuntimeSdk {
  return {
    async ensureRuntimeState() {},
    createSessionManager() {
      return {
        getLeafEntry() {
          return null;
        },
        buildSessionContext() {
          return { messages: [] };
        },
      } satisfies RuntimeSessionManager;
    },
    createToolDefinitions() {
      return [];
    },
    async resolveModel(_config, model) {
      return {
        model,
        authStorage: {},
        modelRegistry: {},
      };
    },
    async createSession(params) {
      const listeners: Array<(event: unknown) => void> = [];
      let currentSystemPrompt = params.systemPrompt;
      const session: RuntimeSession = {
        sessionId: "observability-session",
        messages: [],
        agent: {
          setSystemPrompt(prompt) {
            currentSystemPrompt = prompt;
          },
          replaceMessages(messages) {
            session.messages = [...messages];
          },
          streamFn: async (_model: unknown, _context: unknown) => createFakeAssistantStream(),
        },
        subscribe(listener) {
          listeners.push(listener);
          return () => {
            const index = listeners.indexOf(listener);
            if (index >= 0) {
              listeners.splice(index, 1);
            }
          };
        },
        async prompt(prompt) {
          listeners.forEach((listener) =>
            listener({
              type: "tool_execution_start",
              toolCallId: "tool-1",
              toolName: "read",
              args: { path: "SOUL.md" },
            }),
          );
          listeners.forEach((listener) =>
            listener({
              type: "tool_execution_end",
              toolCallId: "tool-1",
              toolName: "read",
              result: {
                content: [{ type: "text", text: "tool result text" }],
              },
              isError: false,
            }),
          );

          const stream = await (session.agent.streamFn as (
            model: unknown,
            context: unknown,
            options?: unknown,
          ) => Promise<{
            [Symbol.asyncIterator](): AsyncIterator<unknown>;
            result(): Promise<unknown>;
          }>)(
            { provider: "openai", id: "primary" },
            {
              systemPrompt: currentSystemPrompt,
              messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
            },
            {},
          );

          for await (const _event of stream) {
            // events are consumed by observability wrapper
          }

          const result = (await stream.result()) as { role: string; content: unknown };
          session.messages.push({ role: "user", content: [{ type: "text", text: prompt }] });
          session.messages.push(result);
        },
        dispose() {},
      };
      return session;
    },
  };
}

async function createConfig(): Promise<RuntimeConfig> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "companyclaw-observability-"));
  tempDirs.push(tempDir);
  process.env.OPENAI_API_KEY = "test-key";
  await fs.writeFile(
    path.join(tempDir, "companyclaw.config.json"),
    JSON.stringify({
      runtime: {
        thinkingLevel: "medium",
        timeoutMs: 1000,
        execTimeoutMs: 1000,
        observability: {
          enabled: true,
          console: false,
          includePrompts: true,
          includeToolArgs: true,
          includeToolResults: true,
          includeAssistantDeltas: true,
          includeLlmRequests: true,
        },
      },
      primaryModel: {
        provider: "openai",
        id: "primary",
        api: "openai-completions",
        apiKeyEnv: "OPENAI_API_KEY",
        contextWindow: 10000,
        maxTokens: 2000,
        reasoning: false,
        input: ["text"],
      },
      fallbackModels: [],
    }),
    "utf8",
  );
  return await loadConfig({ cwd: tempDir });
}

describe("observability logging", () => {
  it("does not write a run log when trace is disabled", async () => {
    const config = await createConfig();
    const eventTypes: string[] = [];
    const result = await runAgent(
      {
        message: "你好",
      },
      {
        config,
        sdk: createFakeSdk(),
        onRecord(record) {
          eventTypes.push(record.type);
        },
      },
    );

    expect(result.logFile).toBeUndefined();
    expect(eventTypes).toContain("run.start");
    expect(eventTypes).toContain("assistant.final");
  });

  it("writes prompt, llm request, tool events and assistant output to a JSONL trace when enabled", async () => {
    const config = await createConfig();
    const result = await runAgent(
      {
        message: "你好",
      },
      {
        config,
        sdk: createFakeSdk(),
        traceEnabled: true,
      },
    );

    expect(result.logFile).toBeTruthy();
    const logFile = result.logFile as string;
    expect(logFile).toContain(`${path.sep}.companyclaw${path.sep}sessions${path.sep}`);
    const content = await fs.readFile(logFile, "utf8");
    const rows = content
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; [key: string]: unknown });
    const eventTypes = rows.map((row) => row.type);

    expect(eventTypes).toContain("run.start");
    expect(eventTypes).toContain("prompt.system");
    expect(eventTypes).toContain("prompt.user");
    expect(eventTypes).toContain("model.attempt");
    expect(eventTypes).toContain("llm.request");
    expect(eventTypes).toContain("tool.start");
    expect(eventTypes).toContain("tool.end");
    expect(eventTypes).toContain("assistant.delta");
    expect(eventTypes).toContain("assistant.final");
    expect(eventTypes).toContain("run.end");

    const llmRequest = rows.find((row) => row.type === "llm.request");
    expect(llmRequest?.messages).toBeTruthy();
    expect(JSON.stringify(llmRequest?.messages)).toContain("你好");

    const systemPrompt = rows.find((row) => row.type === "prompt.system");
    expect(typeof systemPrompt?.text).toBe("string");
    expect(String(systemPrompt?.text)).toContain("general-purpose agent");

    const toolStart = rows.find((row) => row.type === "tool.start");
    expect(toolStart?.toolName).toBe("read");
    expect(JSON.stringify(toolStart?.args)).toContain("SOUL.md");
  });
});
