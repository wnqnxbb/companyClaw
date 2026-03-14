#!/usr/bin/env node

import { Command } from "commander";
import { runAgent } from "./runtime.js";
import { startHttpServer } from "./server/http.js";

async function main(): Promise<void> {
  const program = new Command();
  program.name("companyclaw").description("Minimal standalone code-agent runtime");

  program
    .command("serve")
    .option("--host <host>", "HTTP bind host", "127.0.0.1")
    .option("--port <port>", "HTTP bind port", "18789")
    .action(async (options: Record<string, unknown>) => {
      const host = typeof options.host === "string" ? options.host : "127.0.0.1";
      const port = Number.parseInt(String(options.port ?? "18789"), 10);
      const started = await startHttpServer({
        host,
        port: Number.isFinite(port) ? port : 18789,
      });
      process.stdout.write(`${JSON.stringify({
        ok: true,
        host: started.host,
        port: started.port,
        baseUrl: started.baseUrl,
      }, null, 2)}\n`);
    });

  program
    .command("agent")
    .requiredOption("-m, --message <message>", "User prompt")
    .option("--session-key <key>", "Session key", "main")
    .option("--session-id <id>", "Explicit session id")
    .option("--workspace-dir <path>", "Workspace directory override")
    .option("--config <path>", "Config file path")
    .option("--trace", "Print detailed runtime trace to stderr", false)
    .option("--json", "Print JSON result", false)
    .action(async (options: Record<string, unknown>) => {
      const result = await runAgent({
        message: String(options.message),
        sessionKey: typeof options.sessionKey === "string" ? options.sessionKey : undefined,
        sessionId: typeof options.sessionId === "string" ? options.sessionId : undefined,
        workspaceDir:
          typeof options.workspaceDir === "string" ? options.workspaceDir : undefined,
        configPath: typeof options.config === "string" ? options.config : undefined,
      }, {
        trace: options.trace === true,
      });

      if (options.json === true) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
      }

      process.stdout.write(`${result.text.trim()}\n`);
    });

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
