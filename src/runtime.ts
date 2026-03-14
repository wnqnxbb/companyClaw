import crypto from "node:crypto";
import { buildSystemPrompt } from "./prompt.js";
import { loadConfig } from "./config.js";
import { attachSessionObservability, createRunLogger } from "./observability.js";
import { resolveWithinRoot } from "./fs-utils.js";
import { resolveSession, updateSessionEntry } from "./session/store.js";
import { createRuntimeTools } from "./tools/index.js";
import { defaultRuntimeSdk, extractAssistantText, repairTrailingUserTurn } from "./sdk/pi.js";
import type {
  AgentRunInput,
  AgentRunResult,
  ModelDefinition,
  RunAgentOptions,
  RuntimeConfig,
} from "./types.js";

async function runSingleAttempt(params: {
  config: RuntimeConfig;
  selectedModel: ModelDefinition;
  message: string;
  sessionFile: string;
  systemPrompt: string;
  sdk: NonNullable<RunAgentOptions["sdk"]>;
  runId: string;
  logger: Awaited<ReturnType<typeof createRunLogger>>;
}): Promise<string> {
  const tools = createRuntimeTools({
    workspaceDir: params.config.workspaceDir,
    execTimeoutMs: params.config.runtime.execTimeoutMs,
  });
  const sessionManager = params.sdk.createSessionManager(params.sessionFile);
  const { model, authStorage, modelRegistry } = await params.sdk.resolveModel(
    params.config,
    params.selectedModel,
  );
  const session = await params.sdk.createSession({
    workspaceDir: params.config.workspaceDir,
    agentDir: params.config.agentDir,
    sessionManager,
    authStorage,
    modelRegistry,
    model,
    thinkingLevel: params.config.runtime.thinkingLevel,
    tools,
    systemPrompt: params.systemPrompt,
  });
  const detachObservability = attachSessionObservability({
    session,
    logger: params.logger,
    runId: params.runId,
    config: params.config,
    selectedModel: params.selectedModel,
  });

  try {
    repairTrailingUserTurn(sessionManager, session);
    await session.prompt(params.message);
    return extractAssistantText(session.messages);
  } finally {
    detachObservability();
    session.dispose?.();
  }
}

function buildPromptMessage(input: AgentRunInput, workspaceDir: string): string {
  const base = input.message.trim();
  const paths = Array.isArray(input.paths) ? input.paths : [];
  if (paths.length === 0) {
    return base;
  }
  const resolvedPaths = paths.map((filePath) => resolveWithinRoot(workspaceDir, filePath));
  return [
    base,
    "",
    "Local paths attached to this request:",
    ...resolvedPaths.map((filePath) => `- ${filePath}`),
    "",
    "If these paths are relevant, inspect them with the available tools before answering.",
  ].join("\n");
}

export async function runAgent(
  input: AgentRunInput,
  options?: RunAgentOptions,
): Promise<AgentRunResult> {
  const config =
    options?.config ??
    (await loadConfig({
      cwd: process.cwd(),
      configPath: input.configPath,
      workspaceDir: input.workspaceDir,
    }));
  const sdk = options?.sdk ?? defaultRuntimeSdk;
  const message = input.message.trim();
  if (!message) {
    throw new Error("Message is required.");
  }

  await sdk.ensureRuntimeState(config);
  const resolvedSession = await resolveSession({
    config,
    sessionKey: input.sessionKey,
    sessionId: input.sessionId,
  });
  const runId = options?.runId?.trim() || crypto.randomUUID();
  const logger = await createRunLogger({
    config,
    runId,
    consoleEnabled: options?.trace === true || config.runtime.observability.console === true,
    onRecord: options?.onRecord,
  });
  await logger?.log("run.start", {
    runId,
    sessionId: resolvedSession.sessionId,
    sessionKey: resolvedSession.sessionKey,
    sessionFile: resolvedSession.sessionFile,
    logFile: logger?.filePath,
  });
  const tools = createRuntimeTools({
    workspaceDir: config.workspaceDir,
    execTimeoutMs: config.runtime.execTimeoutMs,
  });
  const systemPrompt = await buildSystemPrompt({
    config,
    tools,
    extraSystemPrompt: input.extraSystemPrompt,
  });
  const promptMessage = buildPromptMessage(input, config.workspaceDir);
  if (config.runtime.observability.includePrompts) {
    await logger?.log("prompt.system", {
      runId,
      text: systemPrompt,
    });
    await logger?.log("prompt.user", {
      runId,
      text: promptMessage,
    });
  }

  const candidates = [config.primaryModel, ...config.fallbackModels];
  const errors: string[] = [];
  options?.onEvent?.({ type: "lifecycle", phase: "start", detail: resolvedSession.sessionKey });

  try {
    for (const candidate of candidates) {
      options?.onEvent?.({
        type: "lifecycle",
        phase: "attempt",
        detail: `${candidate.provider}/${candidate.id}`,
      });
      await logger?.log("model.attempt", {
        runId,
        provider: candidate.provider,
        model: candidate.id,
      });
      try {
        const text = await runSingleAttempt({
          config,
          selectedModel: candidate,
          message: promptMessage,
          sessionFile: resolvedSession.sessionFile,
          systemPrompt,
          sdk,
          runId,
          logger,
        });
        await updateSessionEntry({
          config,
          sessionKey: resolvedSession.sessionKey,
          patch: {
            modelProvider: candidate.provider,
            model: candidate.id,
          },
        });
        options?.onEvent?.({ type: "assistant", text });
        options?.onEvent?.({
          type: "lifecycle",
          phase: "end",
          detail: `${candidate.provider}/${candidate.id}`,
        });
        await logger?.log("run.end", {
          runId,
          provider: candidate.provider,
          model: candidate.id,
          text,
        });
        return {
          sessionId: resolvedSession.sessionId,
          sessionKey: resolvedSession.sessionKey,
          sessionFile: resolvedSession.sessionFile,
          logFile: logger?.filePath,
          runId,
          text,
          model: {
            provider: candidate.provider,
            model: candidate.id,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${candidate.provider}/${candidate.id}: ${message}`);
        await logger?.log("model.error", {
          runId,
          provider: candidate.provider,
          model: candidate.id,
          error: message,
        });
      }
    }

    options?.onEvent?.({
      type: "lifecycle",
      phase: "error",
      detail: errors.join(" | "),
    });
    await logger?.log("run.error", {
      runId,
      errors,
    });
    throw new Error(`All model attempts failed: ${errors.join(" | ")}`);
  } finally {
    await logger?.close();
  }
}
