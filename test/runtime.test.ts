import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { runAgent } from "../src/runtime.js";
import type {
  RuntimeConfig,
  RuntimeSdk,
  RuntimeSession,
  RuntimeSessionManager,
  RuntimeTool,
} from "../src/types.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

function createFakeSdk(): RuntimeSdk {
  let attempt = 0;
  return {
    async ensureRuntimeState() {},
    createSessionManager() {
      return {
        getLeafEntry() {
          return attempt > 0 ? { type: "message", message: { role: "user" }, parentId: "root" } : null;
        },
        branch() {},
        buildSessionContext() {
          return { messages: [] };
        },
      } satisfies RuntimeSessionManager;
    },
    createToolDefinitions(_tools: RuntimeTool[]) {
      return [];
    },
    async resolveModel(_config, model) {
      return {
        model,
        authStorage: {},
        modelRegistry: {},
      };
    },
    async createSession(params) {
      const session: RuntimeSession = {
        sessionId: "session-1",
        messages: [],
        agent: {
          setSystemPrompt() {},
          replaceMessages(messages) {
            session.messages = [...messages];
          },
        },
        async prompt(prompt) {
          attempt += 1;
          if (attempt === 1) {
            session.messages.push({ role: "user", content: prompt });
            throw new Error("primary failed");
          }
          session.messages.push({
            role: "assistant",
            content: [{ type: "text", text: "fallback answer" }],
          });
        },
        dispose() {},
      };
      return session;
    },
  };
}

async function createConfig(): Promise<RuntimeConfig> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "companyclaw-runtime-"));
  tempDirs.push(tempDir);
  await fs.writeFile(
    path.join(tempDir, "companyclaw.config.json"),
    JSON.stringify({
      primaryModel: {
        provider: "openai",
        id: "primary",
        api: "openai-completions",
        apiKeyEnv: "OPENAI_API_KEY",
        contextWindow: 10000,
        maxTokens: 2000,
        reasoning: false,
        input: ["text"],
      },
      fallbackModels: [
        {
          provider: "openai",
          id: "fallback",
          api: "openai-completions",
          apiKeyEnv: "OPENAI_API_KEY",
          contextWindow: 10000,
          maxTokens: 2000,
          reasoning: false,
          input: ["text"],
        },
      ],
    }),
    "utf8",
  );
  process.env.OPENAI_API_KEY = "test-key";
  return await loadConfig({ cwd: tempDir });
}

describe("runAgent", () => {
  it("falls back to the next configured model when the primary attempt fails", async () => {
    const config = await createConfig();
    const result = await runAgent(
      {
        message: "hello",
      },
      {
        config,
        sdk: createFakeSdk(),
      },
    );

    expect(result.text).toBe("fallback answer");
    expect(result.model.provider).toBe("openai");
    expect(result.model.model).toBe("fallback");
    expect(result.sessionKey).toBe("main");
  });
});
