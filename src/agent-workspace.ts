import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, fileExists, writeJsonFile } from "./fs-utils.js";
import { ensureAgentSeedFiles } from "./sdk/pi.js";
import type { AgentMetadata, RuntimeConfig } from "./types.js";

const AGENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

type StatusError = Error & {
  statusCode: number;
};

function createStatusError(statusCode: number, message: string): StatusError {
  const error = new Error(message) as StatusError;
  error.statusCode = statusCode;
  return error;
}

export function normalizeAgentId(rawAgentId: string): string {
  const agentId = rawAgentId.trim();
  if (!agentId) {
    throw createStatusError(400, "`agentId` is required.");
  }
  if (!AGENT_ID_PATTERN.test(agentId)) {
    throw createStatusError(
      400,
      "`agentId` must contain only letters, numbers, `.`, `_`, and `-`, and cannot include path separators.",
    );
  }
  return agentId;
}

export function resolveAgentRuntimeConfig(config: RuntimeConfig, rawAgentId: string): RuntimeConfig {
  const agentId = normalizeAgentId(rawAgentId);
  const agentRootDir = path.join(config.clawHomeDir, agentId);
  return {
    ...config,
    agentId,
    agentRootDir,
    workspaceDir: path.join(agentRootDir, "workspace"),
    stateDir: agentRootDir,
    agentDir: path.join(agentRootDir, "agent"),
    sessionsDir: path.join(agentRootDir, "sessions"),
    sessionStorePath: path.join(agentRootDir, "sessions.json"),
  };
}

export async function requireAgentRuntimeConfig(
  config: RuntimeConfig,
  rawAgentId: string,
): Promise<RuntimeConfig> {
  const agentConfig = resolveAgentRuntimeConfig(config, rawAgentId);
  if (!(await fileExists(agentConfig.agentRootDir ?? ""))) {
    throw createStatusError(404, `Agent not found: ${agentConfig.agentId}`);
  }
  return agentConfig;
}

export async function createAgentWorkspace(
  config: RuntimeConfig,
  input: { name: string; agentId: string },
): Promise<AgentMetadata & { rootDir: string; workspaceDir: string }> {
  const name = input.name.trim();
  if (!name) {
    throw createStatusError(400, "`name` is required.");
  }
  const agentConfig = resolveAgentRuntimeConfig(config, input.agentId);

  if (!agentConfig.agentRootDir) {
    throw createStatusError(500, "Failed to resolve agent root directory.");
  }
  if (await fileExists(agentConfig.agentRootDir)) {
    throw createStatusError(409, `Agent already exists: ${agentConfig.agentId}`);
  }
  if (!(await fileExists(config.workspaceTemplateDir))) {
    throw createStatusError(500, `Workspace template directory not found: ${config.workspaceTemplateDir}`);
  }

  await ensureDir(config.clawHomeDir);
  await ensureAgentSeedFiles(config.sharedAgentSeedDir, config, {
    overwriteModels: false,
  });

  let createdRoot = false;
  try {
    await ensureDir(agentConfig.agentRootDir);
    createdRoot = true;
    await fs.cp(config.sharedAgentSeedDir, agentConfig.agentDir, {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
    await ensureDir(agentConfig.sessionsDir);
    await writeJsonFile(agentConfig.sessionStorePath, {});
    await fs.cp(config.workspaceTemplateDir, agentConfig.workspaceDir, {
      recursive: true,
      force: false,
      errorOnExist: true,
    });

    const metadata: AgentMetadata = {
      name,
      agentId: agentConfig.agentId ?? input.agentId.trim(),
      createdAt: new Date().toISOString(),
    };
    await writeJsonFile(path.join(agentConfig.agentRootDir, "meta.json"), metadata);
    return {
      ...metadata,
      rootDir: agentConfig.agentRootDir,
      workspaceDir: agentConfig.workspaceDir,
    };
  } catch (error) {
    if (createdRoot) {
      await fs.rm(agentConfig.agentRootDir, { recursive: true, force: true });
    }
    throw error;
  }
}
