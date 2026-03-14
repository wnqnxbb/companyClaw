import { spawn } from "node:child_process";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import type { RuntimeTool } from "../types.js";
import { resolveWithinRoot } from "../fs-utils.js";

const execSchema = Type.Object({
  command: Type.String({ description: "Shell command to execute." }),
  workdir: Type.Optional(
    Type.String({ description: "Optional working directory, relative to the workspace root." }),
  ),
  timeoutMs: Type.Optional(Type.Number({ minimum: 1 })),
  shell: Type.Optional(Type.String({ description: "Shell path override." })),
});

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}\n...[truncated]` : text;
}

export function createExecTool(options: {
  workspaceDir: string;
  defaultTimeoutMs: number;
}): RuntimeTool {
  return {
    name: "exec",
    label: "exec",
    description: "Execute a shell command inside the workspace.",
    parameters: execSchema,
    execute: async (_toolCallId, rawArgs, signal) => {
      const args = rawArgs as {
        command?: string;
        workdir?: string;
        timeoutMs?: number;
        shell?: string;
      };
      const command = args.command?.trim();
      if (!command) {
        throw new Error("exec requires a non-empty command.");
      }

      const cwd = args.workdir?.trim()
        ? resolveWithinRoot(options.workspaceDir, args.workdir.trim())
        : options.workspaceDir;
      const shell = args.shell?.trim() || process.env.SHELL || "/bin/sh";
      const timeoutMs =
        typeof args.timeoutMs === "number" && Number.isFinite(args.timeoutMs) && args.timeoutMs > 0
          ? args.timeoutMs
          : options.defaultTimeoutMs;

      const result = await new Promise<{
        stdout: string;
        stderr: string;
        code: number | null;
        signal: NodeJS.Signals | null;
      }>((resolve, reject) => {
        const child = spawn(shell, ["-lc", command], {
          cwd,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
          child.kill("SIGTERM");
        }, timeoutMs);

        const abortHandler = () => {
          child.kill("SIGTERM");
        };
        signal?.addEventListener("abort", abortHandler, { once: true });

        child.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString("utf8");
        });
        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString("utf8");
        });
        child.on("error", (error) => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", abortHandler);
          reject(error);
        });
        child.on("close", (code, childSignal) => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", abortHandler);
          resolve({ stdout, stderr, code, signal: childSignal });
        });
      });

      const lines = [
        `$ ${command}`,
        `cwd: ${path.relative(options.workspaceDir, cwd) || "."}`,
        `exitCode: ${String(result.code ?? "null")}`,
      ];
      if (result.stdout.trim()) {
        lines.push("\n[stdout]", truncate(result.stdout.trimEnd(), 20_000));
      }
      if (result.stderr.trim()) {
        lines.push("\n[stderr]", truncate(result.stderr.trimEnd(), 20_000));
      }
      if (!result.stdout.trim() && !result.stderr.trim()) {
        lines.push("\n(no output)");
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: {
          code: result.code,
          signal: result.signal,
        },
      };
    },
  };
}
