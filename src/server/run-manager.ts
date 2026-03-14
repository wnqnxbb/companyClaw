import type { RunAgentOptions, TraceRecord } from "../types.js";
import type { HttpRunRequest, HttpRunStatus, RunRecord, RunSummary } from "./types.js";

type RunAgentFn = (
  input: HttpRunRequest,
  options?: RunAgentOptions,
) => Promise<import("../types.js").AgentRunResult>;

export class RunManager {
  private readonly runs = new Map<string, RunRecord>();
  private readonly runAgent: RunAgentFn;

  constructor(runAgent: RunAgentFn) {
    this.runAgent = runAgent;
  }

  async createRun(request: HttpRunRequest): Promise<RunSummary> {
    const runId = crypto.randomUUID();
    const record: RunRecord = {
      runId,
      status: "queued",
      createdAt: new Date().toISOString(),
      request,
      events: [],
      abortController: new AbortController(),
      subscribers: new Set(),
    };
    this.runs.set(runId, record);
    queueMicrotask(() => {
      void this.executeRun(record);
    });
    return this.toSummary(record);
  }

  getRun(runId: string): RunSummary | undefined {
    const record = this.runs.get(runId);
    return record ? this.toSummary(record) : undefined;
  }

  getEvents(runId: string, afterSeq: number = 0): TraceRecord[] | undefined {
    const record = this.runs.get(runId);
    if (!record) {
      return undefined;
    }
    return record.events.filter((event) => event.seq > afterSeq);
  }

  subscribe(runId: string, listener: (record: TraceRecord) => void): (() => void) | undefined {
    const record = this.runs.get(runId);
    if (!record) {
      return undefined;
    }
    record.subscribers.add(listener);
    return () => {
      record.subscribers.delete(listener);
    };
  }

  abort(runId: string): RunSummary | undefined {
    const record = this.runs.get(runId);
    if (!record) {
      return undefined;
    }
    if (record.status === "succeeded" || record.status === "failed" || record.status === "aborted") {
      return this.toSummary(record);
    }
    record.abortController.abort(new Error("Aborted via HTTP"));
    record.status = "aborted";
    record.endedAt = new Date().toISOString();
    this.appendRecord(runId, {
      seq: record.events.length + 1,
      ts: new Date().toISOString(),
      runId,
      type: "run.aborted",
      source: "http",
    });
    return this.toSummary(record);
  }

  private async executeRun(record: RunRecord): Promise<void> {
    record.status = "running";
    record.startedAt = new Date().toISOString();
    try {
      const result = await this.runAgent(record.request, {
        runId: record.runId,
        trace: record.request.traceConsole === true,
        abortSignal: record.abortController.signal,
        onRecord: async (traceRecord) => {
          this.appendRecord(record.runId, traceRecord);
        },
      });
      if ((record.status as HttpRunStatus) !== "aborted") {
        record.status = "succeeded";
        record.result = result;
        record.logFile = result.logFile;
        record.endedAt = new Date().toISOString();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if ((record.status as HttpRunStatus) !== "aborted") {
        record.status = "failed";
        record.error = message;
        record.endedAt = new Date().toISOString();
      }
    }
  }

  private appendRecord(runId: string, record: TraceRecord): void {
    const run = this.runs.get(runId);
    if (!run) {
      return;
    }
    run.events.push(record);
    if (record.type === "run.start") {
      run.logFile = typeof record.logFile === "string" ? record.logFile : run.logFile;
    }
    if (record.type === "run.end" || record.type === "run.error") {
      run.endedAt = typeof record.ts === "string" ? record.ts : new Date().toISOString();
    }
    for (const listener of run.subscribers) {
      listener(record);
    }
  }

  private toSummary(record: RunRecord): RunSummary {
    return {
      runId: record.runId,
      status: record.status,
      createdAt: record.createdAt,
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      request: record.request,
      result: record.result,
      error: record.error,
      logFile: record.logFile,
    };
  }
}
