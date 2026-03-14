import path from "node:path";
import type { RuntimeConfig } from "../types.js";

export function getSessionDir(config: RuntimeConfig, sessionId: string): string {
  return path.join(config.sessionsDir, sessionId);
}

export function getSessionTranscriptFile(config: RuntimeConfig, sessionId: string): string {
  return path.join(getSessionDir(config, sessionId), "transcript.jsonl");
}

export function getSessionRunsDir(config: RuntimeConfig, sessionId: string): string {
  return path.join(getSessionDir(config, sessionId), "runs");
}

export function getSessionRunLogFile(
  config: RuntimeConfig,
  sessionId: string,
  runId: string,
): string {
  return path.join(getSessionRunsDir(config, sessionId), `${runId}.jsonl`);
}
