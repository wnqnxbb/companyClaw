import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveAgentRuntimeConfig } from "../src/agent-workspace.js";
import { DEFAULT_BOOTSTRAP_FILES, loadConfig } from "../src/config.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("resolveAgentRuntimeConfig", () => {
  it("derives agent runtime paths under the fixed claw home", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "companyclaw-agent-home-"));
    tempDirs.push(tempDir);
    const homeDir = path.join(tempDir, ".companyclaw");

    const config = await loadConfig({
      cwd: tempDir,
      clawHomeDir: homeDir,
    });
    const resolved = resolveAgentRuntimeConfig(config, "claw_agent_deep_research");

    expect(config.clawHomeDir).toBe(homeDir);
    expect(config.workspaceTemplateDir).toBe(path.join(tempDir, "templates", "agent-workspace"));
    expect(config.bootstrapFiles).toEqual([...DEFAULT_BOOTSTRAP_FILES]);
    expect(resolved.agentId).toBe("claw_agent_deep_research");
    expect(resolved.agentRootDir).toBe(path.join(homeDir, "claw_agent_deep_research"));
    expect(resolved.workspaceDir).toBe(
      path.join(homeDir, "claw_agent_deep_research", "workspace"),
    );
    expect(resolved.stateDir).toBe(path.join(homeDir, "claw_agent_deep_research"));
    expect(resolved.agentDir).toBe(path.join(homeDir, "claw_agent_deep_research", "agent"));
    expect(resolved.sessionsDir).toBe(path.join(homeDir, "claw_agent_deep_research", "sessions"));
    expect(resolved.sessionStorePath).toBe(
      path.join(homeDir, "claw_agent_deep_research", "sessions.json"),
    );
  });
});
