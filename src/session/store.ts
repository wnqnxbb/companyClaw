import crypto from "node:crypto";
import { ensureDir, readJsonFile, writeJsonFile } from "../fs-utils.js";
import type { ResolvedSession, RuntimeConfig, SessionEntry, SessionStore } from "../types.js";

export async function loadSessionStore(config: RuntimeConfig): Promise<SessionStore> {
  return await readJsonFile<SessionStore>(config.sessionStorePath, {});
}

export async function saveSessionStore(
  config: RuntimeConfig,
  store: SessionStore,
): Promise<void> {
  await ensureDir(config.stateDir);
  await writeJsonFile(config.sessionStorePath, store);
}

function findSessionKeyById(store: SessionStore, sessionId: string): string | undefined {
  return Object.keys(store).find((key) => store[key]?.sessionId === sessionId);
}

export async function resolveSession(params: {
  config: RuntimeConfig;
  sessionKey?: string;
  sessionId?: string;
}): Promise<ResolvedSession> {
  const store = await loadSessionStore(params.config);
  const requestedSessionId = params.sessionId?.trim();
  const requestedKey = params.sessionKey?.trim() || "main";
  const resolvedKey = requestedSessionId
    ? findSessionKeyById(store, requestedSessionId) ?? requestedKey
    : requestedKey;
  const existing = store[resolvedKey];
  const sessionId = requestedSessionId || existing?.sessionId || crypto.randomUUID();
  const sessionFile = existing?.sessionFile || `${params.config.transcriptsDir}/${sessionId}.jsonl`;
  const entry: SessionEntry = {
    sessionId,
    updatedAt: Date.now(),
    sessionFile,
    modelProvider: existing?.modelProvider,
    model: existing?.model,
  };
  store[resolvedKey] = entry;
  await saveSessionStore(params.config, store);
  return {
    sessionId,
    sessionKey: resolvedKey,
    sessionFile,
    entry,
    store,
  };
}

export async function updateSessionEntry(params: {
  config: RuntimeConfig;
  sessionKey: string;
  patch: Partial<SessionEntry>;
}): Promise<SessionEntry> {
  const store = await loadSessionStore(params.config);
  const current = store[params.sessionKey];
  if (!current) {
    throw new Error(`Unknown session key: ${params.sessionKey}`);
  }
  const next: SessionEntry = {
    ...current,
    ...params.patch,
    updatedAt: Date.now(),
    sessionId: params.patch.sessionId ?? current.sessionId,
    sessionFile: params.patch.sessionFile ?? current.sessionFile,
  };
  store[params.sessionKey] = next;
  await saveSessionStore(params.config, store);
  return next;
}
