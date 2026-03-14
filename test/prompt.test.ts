import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { buildSystemPrompt, loadBootstrapFiles } from "../src/prompt.js";
import type { RuntimeTool } from "../src/types.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("prompt bootstrap files", () => {
  it("loads general-agent workspace files in configured order", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "companyclaw-prompt-"));
    tempDirs.push(tempDir);
    await fs.writeFile(path.join(tempDir, "AGENTS.md"), "agents", "utf8");
    await fs.writeFile(path.join(tempDir, "SOUL.md"), "soul", "utf8");
    await fs.writeFile(path.join(tempDir, "USER.md"), "user", "utf8");
    await fs.writeFile(path.join(tempDir, "IDENTITY.md"), "identity", "utf8");
    await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "heartbeat", "utf8");

    const config = await loadConfig({ cwd: tempDir });
    const loaded = await loadBootstrapFiles(config);

    expect(loaded.map((file) => file.name)).toEqual([
      "AGENTS.md",
      "SOUL.md",
      "USER.md",
      "IDENTITY.md",
      "HEARTBEAT.md",
    ]);
  });

  it("builds a general-purpose system prompt rather than a coding-only prompt", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "companyclaw-prompt-system-"));
    tempDirs.push(tempDir);
    await fs.writeFile(path.join(tempDir, "SOUL.md"), "通用代理价值观", "utf8");
    await fs.writeFile(path.join(tempDir, "TOOLS.md"), "工具备忘", "utf8");
    await fs.writeFile(path.join(tempDir, "HEARTBEAT.md"), "运行节奏", "utf8");

    const config = await loadConfig({ cwd: tempDir });
    const tools: RuntimeTool[] = [
      {
        name: "read",
        description: "Read files",
        execute: async () => ({ content: [{ type: "text", text: "ok" }] }),
      },
    ];

    const prompt = await buildSystemPrompt({ config, tools });

    expect(prompt).toContain("general-purpose agent");
    expect(prompt).toContain("Treat coding as one capability among many");
    expect(prompt).toContain("SOUL.md - 价值观、气质和行为边界");
    expect(prompt).toContain("TOOLS.md - 本地环境、工具和模型端点备忘");
    expect(prompt).toContain("HEARTBEAT.md - 运行节奏与近期状态");
  });
});
