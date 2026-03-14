import { afterEach, describe, expect, it } from "vitest";
import { startHttpServer } from "../src/server/http.js";
import type { HttpRunRequest } from "../src/server/types.js";
import type { AgentRunResult, RunAgentOptions, TraceRecord } from "../src/types.js";

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (closers.length > 0) {
    const close = closers.pop();
    if (close) {
      await close();
    }
  }
});

function createFakeRunAgent() {
  return async (
    input: HttpRunRequest,
    options?: RunAgentOptions,
  ): Promise<AgentRunResult> => {
    const runId = options?.runId ?? "run-test";
    let seq = 0;
    const push = async (type: string, payload: Record<string, unknown> = {}) => {
      const event: TraceRecord = {
        seq: ++seq,
        ts: new Date().toISOString(),
        runId,
        type,
        ...payload,
      };
      await options?.onRecord?.(event);
    };

    await push("run.start", { sessionId: "s1", sessionKey: input.sessionKey ?? "main" });
    await push("prompt.system", { text: "system prompt" });
    await push("prompt.user", { text: input.message });
    await push("llm.request", { messages: [{ role: "user", content: input.message }] });
    await push("tool.start", { toolName: "read", args: { path: input.paths?.[0] } });
    await push("tool.end", { toolName: "read", result: { ok: true } });
    await push("assistant.final", { text: "done" });
    await push("run.end", { text: "done" });

    return {
      runId,
      sessionId: "s1",
      sessionKey: input.sessionKey ?? "main",
      sessionFile: "/tmp/session.jsonl",
      logFile: "/tmp/run.jsonl",
      text: "done",
      model: {
        provider: "fake",
        model: "fake-model",
      },
    };
  };
}

async function waitForRunStatus(
  baseUrl: string,
  runId: string,
  expectedStatus: string,
): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/runs/${runId}`);
    const payload = (await response.json()) as { status: string };
    if (payload.status === expectedStatus) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for run ${runId} to reach ${expectedStatus}`);
}

describe("HTTP server", () => {
  it("creates runs, streams events, and returns final status", async () => {
    const started = await startHttpServer({
      port: 0,
      runAgentImpl: createFakeRunAgent() as never,
    });
    closers.push(started.close);

    const createResponse = await fetch(`${started.baseUrl}/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "hello",
        sessionKey: "http-test",
      }),
    });
    expect(createResponse.status).toBe(202);
    const created = (await createResponse.json()) as { runId: string; streamUrl: string };
    expect(created.runId).toBeTruthy();

    await waitForRunStatus(started.baseUrl, created.runId, "succeeded");

    const eventsResponse = await fetch(`${started.baseUrl}/runs/${created.runId}/events`);
    const eventsPayload = (await eventsResponse.json()) as { events: Array<{ type: string }> };
    expect(eventsPayload.events.some((event) => event.type === "prompt.user")).toBe(true);
    expect(eventsPayload.events.some((event) => event.type === "tool.start")).toBe(true);

    const streamResponse = await fetch(`${started.baseUrl}/runs/${created.runId}/stream`);
    const streamText = await streamResponse.text();
    expect(streamText).toContain("assistant.final");

    const finalResponse = await fetch(`${started.baseUrl}/runs/${created.runId}`);
    const finalStatus = (await finalResponse.json()) as { status: string; result?: { text: string } };
    expect(finalStatus.status).toBe("succeeded");
    expect(finalStatus.result?.text).toBe("done");
  });

  it("rejects invalid paths outside workspace", async () => {
    const started = await startHttpServer({
      port: 0,
      runAgentImpl: createFakeRunAgent() as never,
    });
    closers.push(started.close);

    const response = await fetch(`${started.baseUrl}/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "hello",
        workspaceDir: "/tmp/workspace",
        paths: ["../escape.txt"],
      }),
    });

    expect(response.status).toBe(400);
  });
});
