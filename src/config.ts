import path from "node:path";
import { z } from "zod";
import { fileExists, readJsonFile } from "./fs-utils.js";
import type { ModelDefinition, RuntimeConfig } from "./types.js";

export const DEFAULT_BOOTSTRAP_FILES = [
  "AGENTS.md",
  "SOUL.md",
  "USER.md",
  "IDENTITY.md",
  "TOOLS.md",
  "BOOTSTRAP.md",
  "MEMORY.md",
] as const;

const modelSchema = z.object({
  provider: z.string().trim().min(1),
  id: z.string().trim().min(1),
  api: z.string().trim().min(1).default("openai-completions"),
  baseUrl: z.string().trim().url().optional(),
  apiKey: z.string().trim().min(1).optional(),
  apiKeyEnv: z.string().trim().min(1).optional(),
  contextWindow: z.number().int().positive().default(128_000),
  maxTokens: z.number().int().positive().default(16_384),
  reasoning: z.boolean().default(false),
  input: z.array(z.enum(["text", "image"])).min(1).default(["text"]),
});

const configSchema = z.object({
  workspaceDir: z.string().trim().min(1).optional(),
  stateDir: z.string().trim().min(1).optional(),
  bootstrapFiles: z.array(z.string().trim().min(1)).default([...DEFAULT_BOOTSTRAP_FILES]),
  runtime: z
    .object({
      thinkingLevel: z.string().trim().min(1).default("medium"),
      timeoutMs: z.number().int().positive().default(10 * 60 * 1000),
      execTimeoutMs: z.number().int().positive().default(2 * 60 * 1000),
      observability: z
        .object({
          enabled: z.boolean().default(true),
          logDir: z.string().trim().min(1).default("logs"),
          console: z.boolean().default(false),
          includePrompts: z.boolean().default(true),
          includeToolArgs: z.boolean().default(true),
          includeToolResults: z.boolean().default(true),
          includeAssistantDeltas: z.boolean().default(true),
          includeLlmRequests: z.boolean().default(true),
        })
        .default({
          enabled: true,
          logDir: "logs",
          console: false,
          includePrompts: true,
          includeToolArgs: true,
          includeToolResults: true,
          includeAssistantDeltas: true,
          includeLlmRequests: true,
        }),
    })
    .default({
      thinkingLevel: "medium",
      timeoutMs: 10 * 60 * 1000,
      execTimeoutMs: 2 * 60 * 1000,
      observability: {
        enabled: true,
        logDir: "logs",
        console: false,
        includePrompts: true,
        includeToolArgs: true,
        includeToolResults: true,
        includeAssistantDeltas: true,
        includeLlmRequests: true,
      },
    }),
  primaryModel: modelSchema.optional(),
  fallbackModels: z.array(modelSchema).default([]),
});

export const DEFAULT_CONFIG_FILE = "companyclaw.config.json";

function defaultPrimaryModel(): ModelDefinition {
  const provider = (process.env.COMPANYCLAW_PROVIDER ?? "openai").trim();
  const defaultApiKeyEnv = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
  const contextWindow = Number(process.env.COMPANYCLAW_CONTEXT_WINDOW ?? 128_000);
  const maxTokens = Number(process.env.COMPANYCLAW_MAX_TOKENS ?? 16_384);
  return {
    provider,
    id: (process.env.COMPANYCLAW_MODEL ?? "gpt-4.1").trim(),
    api: (process.env.COMPANYCLAW_MODEL_API ?? "openai-completions").trim(),
    baseUrl: process.env.COMPANYCLAW_BASE_URL?.trim() || undefined,
    apiKey: process.env.COMPANYCLAW_API_KEY?.trim() || undefined,
    apiKeyEnv: process.env.COMPANYCLAW_API_KEY_ENV?.trim() || defaultApiKeyEnv,
    contextWindow: Number.isFinite(contextWindow) && contextWindow > 0 ? contextWindow : 128_000,
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 16_384,
    reasoning: process.env.COMPANYCLAW_REASONING === "1",
    input: ["text"],
  };
}

export function resolveModelApiKey(model: ModelDefinition): string | undefined {
  if (model.apiKey?.trim()) {
    return model.apiKey.trim();
  }
  if (model.apiKeyEnv?.trim()) {
    const value = process.env[model.apiKeyEnv.trim()];
    if (value?.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

export async function loadConfig(options?: {
  cwd?: string;
  configPath?: string;
  workspaceDir?: string;
}): Promise<RuntimeConfig> {
  const cwd = path.resolve(options?.cwd ?? process.cwd());
  const configPath = options?.configPath
    ? path.resolve(cwd, options.configPath)
    : path.resolve(cwd, DEFAULT_CONFIG_FILE);
  const hasConfigFile = await fileExists(configPath);
  const raw = hasConfigFile ? await readJsonFile(configPath, {}) : {};
  const parsed = configSchema.parse(raw);

  const workspaceDir = path.resolve(
    cwd,
    options?.workspaceDir ?? parsed.workspaceDir ?? process.env.COMPANYCLAW_WORKSPACE_DIR ?? ".",
  );
  const stateDir = path.resolve(
    workspaceDir,
    parsed.stateDir ?? process.env.COMPANYCLAW_STATE_DIR ?? ".companyclaw",
  );
  const agentDir = path.join(stateDir, "agent");
  const transcriptsDir = path.join(stateDir, "transcripts");
  const sessionStorePath = path.join(stateDir, "sessions.json");

  return {
    workspaceDir,
    stateDir,
    agentDir,
    transcriptsDir,
    sessionStorePath,
    bootstrapFiles: parsed.bootstrapFiles,
    runtime: parsed.runtime,
    primaryModel: parsed.primaryModel ?? defaultPrimaryModel(),
    fallbackModels: parsed.fallbackModels,
  };
}
