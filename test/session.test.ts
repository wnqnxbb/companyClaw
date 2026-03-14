import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { resolveSession } from "../src/session/store.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("resolveSession", () => {
  it("creates a default main session and reuses it by key", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "companyclaw-session-"));
    tempDirs.push(tempDir);
    const config = await loadConfig({ cwd: tempDir });

    const first = await resolveSession({ config });
    const second = await resolveSession({ config, sessionKey: "main" });

    expect(first.sessionKey).toBe("main");
    expect(second.sessionId).toBe(first.sessionId);
    expect(second.sessionFile).toBe(first.sessionFile);
    expect(first.sessionFile).toBe(
      path.join(config.sessionsDir, first.sessionId, "transcript.jsonl"),
    );
  });

  it("prefers an existing session when resolving by session id", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "companyclaw-session-id-"));
    tempDirs.push(tempDir);
    const config = await loadConfig({ cwd: tempDir });

    const created = await resolveSession({ config, sessionKey: "feature" });
    const byId = await resolveSession({ config, sessionId: created.sessionId });

    expect(byId.sessionKey).toBe("feature");
    expect(byId.sessionId).toBe(created.sessionId);
    expect(byId.sessionFile).toBe(path.join(config.sessionsDir, created.sessionId, "transcript.jsonl"));
  });
});
