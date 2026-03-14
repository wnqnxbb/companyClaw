import fs from "node:fs/promises";
import path from "node:path";
import * as PiCodingAgent from "@mariozechner/pi-coding-agent";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { ensureDir, fileExists, writeJsonFile } from "../fs-utils.js";
import { resolveModelApiKey } from "../config.js";
import type {
  ModelDefinition,
  RuntimeConfig,
  RuntimeSdk,
  RuntimeSession,
  RuntimeSessionManager,
  RuntimeTool,
} from "../types.js";
import { toToolDefinitions } from "../tools/index.js";

type CredentialRecord = {
  type: "api_key";
  key: string;
};

type CredentialMap = Record<string, CredentialRecord>;

function buildCredentials(models: ModelDefinition[]): CredentialMap {
  const credentials: CredentialMap = {};
  for (const model of models) {
    const apiKey = resolveModelApiKey(model);
    if (!apiKey) {
      continue;
    }
    credentials[model.provider] = {
      type: "api_key",
      key: apiKey,
    };
  }
  return credentials;
}

function buildModelsPayload(config: Pick<RuntimeConfig, "primaryModel" | "fallbackModels">) {
  const allModels = [config.primaryModel, ...config.fallbackModels];
  const providers: Record<
    string,
    { apiKey: string; baseUrl?: string; api: string; models: Array<Record<string, unknown>> }
  > = {};

  for (const model of allModels) {
    const provider = providers[model.provider] ?? {
      apiKey: model.apiKeyEnv?.trim() || "__RUNTIME_API_KEY__",
      baseUrl: model.baseUrl,
      api: model.api,
      models: [] as Array<Record<string, unknown>>,
    };
    provider.models.push({
      id: model.id,
      name: model.id,
      reasoning: model.reasoning,
      input: model.input,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
    });
    providers[model.provider] = provider;
  }

  return { providers };
}

function createInMemoryAuthStorageBackend(initialData: CredentialMap): {
  withLock: <T>(update: (current: string) => { result: T; next?: string }) => T;
} {
  let snapshot = JSON.stringify(initialData, null, 2);
  return {
    withLock<T>(update: (current: string) => { result: T; next?: string }): T {
      const { result, next } = update(snapshot);
      if (typeof next === "string") {
        snapshot = next;
      }
      return result;
    },
  };
}

function createRuntimeAuthStorage(credentials: CredentialMap, agentDir: string): unknown {
  const authStorageClass = PiCodingAgent.AuthStorage as unknown as {
    inMemory?: (data: unknown) => unknown;
    fromStorage?: (storage: unknown) => unknown;
    create?: (filePath: string) => unknown;
    new (filePath: string): unknown;
  };

  if (typeof authStorageClass.inMemory === "function") {
    return authStorageClass.inMemory(credentials);
  }

  if (typeof authStorageClass.fromStorage === "function") {
    const backendCtor = (PiCodingAgent as { InMemoryAuthStorageBackend?: new () => unknown })
      .InMemoryAuthStorageBackend;
    const backend =
      typeof backendCtor === "function"
        ? new backendCtor()
        : createInMemoryAuthStorageBackend(credentials);
    const anyBackend = backend as {
      withLock?: (update: (current: string) => { result: unknown; next?: string }) => unknown;
    };
    anyBackend.withLock?.(() => ({
      result: undefined,
      next: JSON.stringify(credentials, null, 2),
    }));
    return authStorageClass.fromStorage(backend);
  }

  const authPath = path.join(agentDir, "auth.json");
  const storage =
    typeof authStorageClass.create === "function"
      ? authStorageClass.create(authPath)
      : new authStorageClass(authPath);
  const runtimeStorage = storage as {
    setRuntimeApiKey?: (provider: string, apiKey: string) => void;
  };
  for (const [provider, credential] of Object.entries(credentials)) {
    runtimeStorage.setRuntimeApiKey?.(provider, credential.key);
  }
  return storage;
}

export async function ensureAgentSeedFiles(
  agentDir: string,
  config: Pick<RuntimeConfig, "primaryModel" | "fallbackModels">,
  options?: { overwriteModels?: boolean },
): Promise<void> {
  await ensureDir(agentDir);
  const modelsPath = path.join(agentDir, "models.json");
  if (options?.overwriteModels !== false || !(await fileExists(modelsPath))) {
    await writeJsonFile(modelsPath, buildModelsPayload(config));
  }
  const authPath = path.join(agentDir, "auth.json");
  if (!(await fileExists(authPath))) {
    await fs.writeFile(authPath, "{}\n", "utf8");
  }
}

function createSettingsManagerCompat(workspaceDir: string, agentDir: string): unknown {
  const settingsClass = SettingsManager as unknown as {
    inMemory?: (settings: Record<string, unknown>) => unknown;
    create?: (cwd: string, agentDir: string) => unknown;
    new (cwd?: string, agentDir?: string): unknown;
  };
  if (typeof settingsClass.inMemory === "function") {
    return settingsClass.inMemory({});
  }
  if (typeof settingsClass.create === "function") {
    return settingsClass.create(workspaceDir, agentDir);
  }
  return new settingsClass(workspaceDir, agentDir);
}

function applySystemPrompt(session: RuntimeSession, systemPrompt: string): void {
  const prompt = systemPrompt.trim();
  session.agent.setSystemPrompt?.(prompt);
  const mutable = session as RuntimeSession & {
    _baseSystemPrompt?: string;
    _rebuildSystemPrompt?: () => string;
  };
  mutable._baseSystemPrompt = prompt;
  mutable._rebuildSystemPrompt = () => prompt;
}

export function repairTrailingUserTurn(
  sessionManager: RuntimeSessionManager,
  session: RuntimeSession,
): void {
  const leaf = sessionManager.getLeafEntry?.();
  if (leaf?.type !== "message" || leaf.message?.role !== "user") {
    return;
  }
  if (leaf.parentId) {
    sessionManager.branch?.(leaf.parentId);
  } else {
    sessionManager.resetLeaf?.();
  }
  const rebuilt = sessionManager.buildSessionContext?.();
  if (rebuilt?.messages) {
    session.agent.replaceMessages?.(rebuilt.messages);
  }
}

export function extractAssistantText(messages: Array<unknown>): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== "object") {
      continue;
    }
    if ((message as { role?: unknown }).role !== "assistant") {
      continue;
    }
    const content = (message as { content?: unknown }).content;
    if (typeof content === "string" && content.trim()) {
      return content.trim();
    }
    if (Array.isArray(content)) {
      const text = content
        .map((block) => {
          if (!block || typeof block !== "object") {
            return "";
          }
          const typed = block as { type?: unknown; text?: unknown };
          return typed.type === "text" && typeof typed.text === "string" ? typed.text : "";
        })
        .join("\n")
        .trim();
      if (text) {
        return text;
      }
    }
  }
  return "";
}

export const defaultRuntimeSdk: RuntimeSdk = {
  async ensureRuntimeState(config) {
    await ensureDir(config.stateDir);
    await ensureDir(config.sessionsDir);
    await ensureAgentSeedFiles(config.agentDir, config);
  },
  createSessionManager(sessionFile) {
    return SessionManager.open(sessionFile) as unknown as RuntimeSessionManager;
  },
  createToolDefinitions(tools) {
    return toToolDefinitions(tools);
  },
  async resolveModel(config, selectedModel) {
    const credentials = buildCredentials([config.primaryModel, ...config.fallbackModels]);
    const authStorage = createRuntimeAuthStorage(credentials, config.agentDir);
    const modelRegistry = new (PiCodingAgent.ModelRegistry as unknown as new (
      authStorage: unknown,
      modelsPath: string,
    ) => unknown)(authStorage, path.join(config.agentDir, "models.json"));
    const registry = modelRegistry as {
      find: (provider: string, modelId: string) => unknown;
    };
    const model = registry.find(selectedModel.provider, selectedModel.id);
    if (!model) {
      throw new Error(`Unknown model: ${selectedModel.provider}/${selectedModel.id}`);
    }
    return { model, authStorage, modelRegistry };
  },
  async createSession(params) {
    const { session } = (await createAgentSession({
      cwd: params.workspaceDir,
      agentDir: params.agentDir,
      authStorage: params.authStorage as never,
      modelRegistry: params.modelRegistry as never,
      model: params.model as never,
      thinkingLevel: params.thinkingLevel as never,
      tools: [],
      customTools: toToolDefinitions(params.tools) as never,
      sessionManager: params.sessionManager as never,
      settingsManager: createSettingsManagerCompat(params.workspaceDir, params.agentDir) as never,
      resourceLoader: new DefaultResourceLoader({
        cwd: params.workspaceDir,
        agentDir: params.agentDir,
      }),
    })) as {
      session?: RuntimeSession;
    };
    if (!session) {
      throw new Error("Failed to create runtime session.");
    }
    applySystemPrompt(session, params.systemPrompt);
    return session;
  },
};
