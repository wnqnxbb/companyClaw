import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_BOOTSTRAP_FILES, loadConfig, resolveModelApiKey } from "../src/config.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
  delete process.env.COMPANYCLAW_PROVIDER;
  delete process.env.COMPANYCLAW_MODEL;
  delete process.env.OPENAI_API_KEY;
});

describe("loadConfig", () => {
  it("loads config file and derives state paths from workspace", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "companyclaw-config-"));
    tempDirs.push(tempDir);
    await fs.writeFile(
      path.join(tempDir, "companyclaw.config.json"),
      JSON.stringify({
        workspaceDir: "workspace",
        runtime: { timeoutMs: 1_000, execTimeoutMs: 2_000, thinkingLevel: "high" },
        primaryModel: {
          provider: "openai",
          id: "gpt-test",
          api: "openai-completions",
          apiKeyEnv: "OPENAI_API_KEY",
          contextWindow: 10_000,
          maxTokens: 2_000,
          reasoning: false,
          input: ["text"],
        },
      }),
      "utf8",
    );

    const config = await loadConfig({ cwd: tempDir });

    expect(config.workspaceDir).toBe(path.join(tempDir, "workspace"));
    expect(config.stateDir).toBe(path.join(tempDir, "workspace", ".companyclaw"));
    expect(config.sessionStorePath).toBe(
      path.join(tempDir, "workspace", ".companyclaw", "sessions.json"),
    );
    expect(config.runtime.thinkingLevel).toBe("high");
  });

  it("falls back to environment defaults when config file is absent", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "companyclaw-env-"));
    tempDirs.push(tempDir);
    process.env.COMPANYCLAW_PROVIDER = "openai";
    process.env.COMPANYCLAW_MODEL = "gpt-4.1-mini";
    process.env.OPENAI_API_KEY = "test-openai-key";

    const config = await loadConfig({ cwd: tempDir });

    expect(config.primaryModel.provider).toBe("openai");
    expect(config.primaryModel.id).toBe("gpt-4.1-mini");
    expect(resolveModelApiKey(config.primaryModel)).toBe("test-openai-key");
    expect(config.bootstrapFiles).toEqual([...DEFAULT_BOOTSTRAP_FILES]);
  });
});
