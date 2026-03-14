import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { startHttpServer } from "../src/server/http.js";
import type { HttpRunRequest } from "../src/server/types.js";
import type { AgentRunResult, RunAgentOptions, TraceRecord } from "../src/types.js";

const closers: Array<() => Promise<void>> = [];
const tempDirs: string[] = [];

afterEach(async () => {
  while (closers.length > 0) {
    const close = closers.pop();
    if (close) {
      await close();
    }
  }
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

function createFakeRunAgent() {
  return async (
    input: HttpRunRequest,
    options?: RunAgentOptions,
  ): Promise<AgentRunResult> => {
    const runtimeConfig = options?.config;
    const runId = options?.runId ?? "run-test";
    const sessionId = "s1";
    const sessionFile = runtimeConfig
      ? path.join(runtimeConfig.sessionsDir, sessionId, "transcript.jsonl")
      : "/tmp/session.jsonl";
    const logFile =
      runtimeConfig && options?.traceEnabled === true
        ? path.join(runtimeConfig.sessionsDir, sessionId, "runs", `${runId}.jsonl`)
        : undefined;
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

    await push("run.start", {
      sessionId,
      sessionKey: input.sessionKey ?? "main",
      sessionFile,
      logFile,
    });
    await push("prompt.system", { text: "system prompt" });
    await push("prompt.user", { text: input.message });
    await push("llm.request", { messages: [{ role: "user", content: input.message }] });
    await push("tool.start", { toolName: "read", args: { path: input.paths?.[0] } });
    await push("tool.end", { toolName: "read", result: { ok: true } });
    await push("assistant.final", { text: "done" });
    await push("run.end", { text: "done" });

    return {
      runId,
      sessionId,
      sessionKey: input.sessionKey ?? "main",
      sessionFile,
      logFile,
      text: "done",
      model: {
        provider: "fake",
        model: "fake-model",
      },
    };
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function writeTemplateFiles(rootDir: string): Promise<void> {
  const templateDir = path.join(rootDir, "templates", "agent-workspace");
  await fs.mkdir(templateDir, { recursive: true });
  const files: Record<string, string> = {
    "AGENTS.md": "# AGENTS\n",
    "SOUL.md": "# SOUL\n",
    "USER.md": "# USER\n",
    "IDENTITY.md": "# IDENTITY\n",
    "TOOLS.md": "# TOOLS\n",
    "BOOTSTRAP.md": "# BOOTSTRAP\n",
    "HEARTBEAT.md": "# HEARTBEAT\n",
    "MEMORY.md": "# MEMORY\n",
  };
  await Promise.all(
    Object.entries(files).map(async ([fileName, content]) => {
      await fs.writeFile(path.join(templateDir, fileName), content, "utf8");
    }),
  );
}

async function createStartedServer(options?: { trace?: boolean }) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "companyclaw-http-"));
  tempDirs.push(tempDir);
  const clawHomeDir = path.join(tempDir, ".companyclaw");
  await writeTemplateFiles(tempDir);
  const config = await loadConfig({
    cwd: tempDir,
    clawHomeDir,
  });
  const started = await startHttpServer({
    port: 0,
    trace: options?.trace === true,
    config,
    runAgentImpl: createFakeRunAgent() as never,
  });
  closers.push(started.close);
  return {
    started,
    clawHomeDir,
  };
}

async function createAgent(baseUrl: string, payload?: { name?: string; agentId?: string }) {
  return await fetch(`${baseUrl}/agents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: payload?.name ?? "研究 Agent",
      agentId: payload?.agentId ?? "claw_agent_deep_research",
    }),
  });
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
  it("creates agent workspaces from the shared seed and template files", async () => {
    const { started, clawHomeDir } = await createStartedServer();

    const response = await createAgent(started.baseUrl);

    expect(response.status).toBe(201);
    const created = (await response.json()) as {
      agentId: string;
      rootDir: string;
      workspaceDir: string;
    };
    expect(created.agentId).toBe("claw_agent_deep_research");
    expect(created.rootDir).toBe(path.join(clawHomeDir, "claw_agent_deep_research"));
    expect(created.workspaceDir).toBe(
      path.join(clawHomeDir, "claw_agent_deep_research", "workspace"),
    );

    expect(await pathExists(path.join(clawHomeDir, "agent", "models.json"))).toBe(true);
    expect(await pathExists(path.join(clawHomeDir, "agent", "auth.json"))).toBe(true);
    expect(
      await pathExists(path.join(clawHomeDir, "claw_agent_deep_research", "meta.json")),
    ).toBe(true);
    expect(
      await pathExists(path.join(clawHomeDir, "claw_agent_deep_research", "sessions.json")),
    ).toBe(true);
    expect(
      await pathExists(
        path.join(clawHomeDir, "claw_agent_deep_research", "workspace", "HEARTBEAT.md"),
      ),
    ).toBe(true);
    expect(
      await pathExists(path.join(clawHomeDir, "claw_agent_deep_research", "agent", "models.json")),
    ).toBe(true);
  });

  it("returns 409 when creating the same agent twice", async () => {
    const { started } = await createStartedServer();

    const first = await createAgent(started.baseUrl);
    const second = await createAgent(started.baseUrl);

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
  });

  it("creates runs, streams events, and returns final status", async () => {
    const { started, clawHomeDir } = await createStartedServer({ trace: true });
    await createAgent(started.baseUrl);

    const createResponse = await fetch(`${started.baseUrl}/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agentId: "claw_agent_deep_research",
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
    const finalStatus = (await finalResponse.json()) as {
      status: string;
      result?: { text: string; sessionFile: string; logFile?: string };
    };
    expect(finalStatus.status).toBe("succeeded");
    expect(finalStatus.result?.text).toBe("done");
    expect(finalStatus.result?.sessionFile).toContain(
      path.join(clawHomeDir, "claw_agent_deep_research", "sessions"),
    );
    expect(finalStatus.result?.logFile).toContain(
      path.join(clawHomeDir, "claw_agent_deep_research", "sessions"),
    );
  });

  it("rejects missing agent id on run requests", async () => {
    const { started } = await createStartedServer();

    const response = await fetch(`${started.baseUrl}/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "hello",
      }),
    });

    expect(response.status).toBe(400);
  });

  it("returns 404 for unknown agents on run requests", async () => {
    const { started } = await createStartedServer();

    const response = await fetch(`${started.baseUrl}/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agentId: "missing_agent",
        message: "hello",
      }),
    });

    expect(response.status).toBe(404);
  });

  it("rejects invalid paths outside the agent workspace", async () => {
    const { started } = await createStartedServer();
    await createAgent(started.baseUrl);

    const response = await fetch(`${started.baseUrl}/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agentId: "claw_agent_deep_research",
        message: "hello",
        paths: ["../escape.txt"],
      }),
    });

    expect(response.status).toBe(400);
  });
});
