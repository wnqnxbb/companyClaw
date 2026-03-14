import type { AgentRunInput, AgentRunResult, TraceRecord } from "../types.js";

export type HttpRunRequest = Pick<
  AgentRunInput,
  "message" | "paths" | "sessionKey" | "sessionId" | "workspaceDir" | "configPath" | "extraSystemPrompt"
> & {
  traceConsole?: boolean;
};

export type HttpRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "aborted";

export type RunSummary = {
  runId: string;
  status: HttpRunStatus;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  request: HttpRunRequest;
  result?: AgentRunResult;
  error?: string;
  logFile?: string;
};

export type RunRecord = RunSummary & {
  events: TraceRecord[];
  abortController: AbortController;
  subscribers: Set<(record: TraceRecord) => void>;
};
