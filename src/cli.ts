#!/usr/bin/env node

import { Command } from "commander";
import { startHttpServer } from "./server/http.js";

async function main(): Promise<void> {
  const program = new Command();
  program.name("companyclaw").description("Minimal standalone code-agent runtime");

  program
    .command("serve")
    .option("--host <host>", "HTTP bind host", "127.0.0.1")
    .option("--port <port>", "HTTP bind port", "18789")
    .option("--trace", "Enable per-run trace files under the session directory", false)
    .action(async (options: Record<string, unknown>) => {
      const host = typeof options.host === "string" ? options.host : "127.0.0.1";
      const port = Number.parseInt(String(options.port ?? "18789"), 10);
      const started = await startHttpServer({
        host,
        port: Number.isFinite(port) ? port : 18789,
        trace: options.trace === true,
      });
      process.stdout.write(`${JSON.stringify({
        ok: true,
        host: started.host,
        port: started.port,
        baseUrl: started.baseUrl,
      }, null, 2)}\n`);
    });

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
