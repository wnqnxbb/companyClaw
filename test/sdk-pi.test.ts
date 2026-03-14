import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { defaultRuntimeSdk } from "../src/sdk/pi.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
  delete process.env.SOHU_BPD_API_KEY;
});

describe("defaultRuntimeSdk custom provider models", () => {
  it("writes models.json in provider-wrapped format and resolves the custom model", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "companyclaw-sdk-"));
    tempDirs.push(tempDir);
    process.env.SOHU_BPD_API_KEY = "test-key";

    await fs.writeFile(
      path.join(tempDir, "companyclaw.config.json"),
      JSON.stringify({
        primaryModel: {
          provider: "sohu-bpd",
          id: "qwen3.5:9b",
          api: "openai-completions",
          baseUrl: "http://aibook.adrd.sohuno.com/bpd_model/v1",
          apiKeyEnv: "SOHU_BPD_API_KEY",
          contextWindow: 128000,
          maxTokens: 8192,
          reasoning: false,
          input: ["text"],
        },
        fallbackModels: [],
      }),
      "utf8",
    );

    const config = await loadConfig({ cwd: tempDir });
    await defaultRuntimeSdk.ensureRuntimeState(config);

    const modelsJsonPath = path.join(config.agentDir, "models.json");
    const modelsJson = JSON.parse(await fs.readFile(modelsJsonPath, "utf8")) as {
      providers?: Record<string, unknown>;
    };

    expect(modelsJson.providers).toBeTruthy();
    expect(modelsJson.providers?.["sohu-bpd"]).toBeTruthy();

    const resolved = await defaultRuntimeSdk.resolveModel(config, config.primaryModel);
    expect(resolved.model).toBeTruthy();
  });
});
