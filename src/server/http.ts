import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { loadConfig } from "../config.js";
import { resolveWithinRoot } from "../fs-utils.js";
import { runAgent } from "../runtime.js";
import type { RuntimeConfig } from "../types.js";
import { RunManager } from "./run-manager.js";
import type { HttpRunRequest } from "./types.js";

type ServerOptions = {
  host?: string;
  port?: number;
  trace?: boolean;
  config?: RuntimeConfig;
  runAgentImpl?: typeof runAgent;
};

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? (JSON.parse(raw) as unknown) : {};
}

function parseRunPath(pathname: string): { runId: string; action?: string } | null {
  const match = pathname.match(/^\/runs\/([^/]+)(?:\/([^/]+))?$/);
  if (!match?.[1]) {
    return null;
  }
  return {
    runId: match[1],
    action: match[2],
  };
}

function normalizeRunRequest(raw: unknown, config: RuntimeConfig): HttpRunRequest {
  if (!raw || typeof raw !== "object") {
    throw new Error("Request body must be an object.");
  }
  const body = raw as Record<string, unknown>;
  if (typeof body.message !== "string" || body.message.trim() === "") {
    throw new Error("`message` is required.");
  }

  const workspaceDir =
    typeof body.workspaceDir === "string" && body.workspaceDir.trim()
      ? body.workspaceDir.trim()
      : undefined;
  const effectiveWorkspace = workspaceDir ?? config.workspaceDir;

  const rawPaths = Array.isArray(body.paths) ? body.paths : undefined;
  const paths =
    rawPaths?.map((value) => {
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error("`paths` must be an array of non-empty strings.");
      }
      return resolveWithinRoot(effectiveWorkspace, value.trim());
    }) ?? undefined;

  return {
    message: body.message.trim(),
    paths,
    sessionKey: typeof body.sessionKey === "string" ? body.sessionKey.trim() : undefined,
    sessionId: typeof body.sessionId === "string" ? body.sessionId.trim() : undefined,
    workspaceDir,
    configPath: typeof body.configPath === "string" ? body.configPath.trim() : undefined,
    extraSystemPrompt:
      typeof body.extraSystemPrompt === "string" ? body.extraSystemPrompt : undefined,
    traceConsole: body.traceConsole === true,
  };
}

function writeSse(res: ServerResponse, event: unknown): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export async function startHttpServer(options?: ServerOptions): Promise<{
  server: http.Server;
  runManager: RunManager;
  host: string;
  port: number;
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const config =
    options?.config ??
    (await loadConfig({
      cwd: process.cwd(),
    }));
  const host = options?.host ?? "127.0.0.1";
  const desiredPort = options?.port ?? 18789;
  const runManager = new RunManager(options?.runAgentImpl ?? runAgent, {
    traceEnabled: options?.trace === true,
  });

  const server = http.createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);

    try {
      if (method === "GET" && requestUrl.pathname === "/health") {
        sendJson(res, 200, {
          ok: true,
          service: "companyclaw-http",
          host,
          port: boundPort,
        });
        return;
      }

      if (method === "POST" && requestUrl.pathname === "/runs") {
        const body = await readJsonBody(req);
        const runRequest = normalizeRunRequest(body, config);
        const created = await runManager.createRun(runRequest);
        sendJson(res, 202, {
          ...created,
          runUrl: `/runs/${created.runId}`,
          eventsUrl: `/runs/${created.runId}/events`,
          streamUrl: `/runs/${created.runId}/stream`,
          abortUrl: `/runs/${created.runId}/abort`,
        });
        return;
      }

      const parsedRunPath = parseRunPath(requestUrl.pathname);
      if (parsedRunPath) {
        const { runId, action } = parsedRunPath;
        if (method === "GET" && !action) {
          const run = runManager.getRun(runId);
          if (!run) {
            sendJson(res, 404, { error: "Run not found." });
            return;
          }
          sendJson(res, 200, run);
          return;
        }
        if (method === "GET" && action === "events") {
          const afterSeq = Number.parseInt(requestUrl.searchParams.get("afterSeq") ?? "0", 10) || 0;
          const events = runManager.getEvents(runId, afterSeq);
          const run = runManager.getRun(runId);
          if (!events || !run) {
            sendJson(res, 404, { error: "Run not found." });
            return;
          }
          sendJson(res, 200, {
            runId,
            status: run.status,
            events,
            nextSeq: events.at(-1)?.seq ?? afterSeq,
          });
          return;
        }
        if (method === "GET" && action === "stream") {
          const run = runManager.getRun(runId);
          if (!run) {
            sendJson(res, 404, { error: "Run not found." });
            return;
          }
          const afterSeq = Number.parseInt(requestUrl.searchParams.get("afterSeq") ?? "0", 10) || 0;
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache, no-transform");
          res.setHeader("Connection", "keep-alive");
          res.setHeader("X-Accel-Buffering", "no");
          const backlog = runManager.getEvents(runId, afterSeq) ?? [];
          for (const event of backlog) {
            writeSse(res, event);
          }
          if (run.status !== "queued" && run.status !== "running") {
            res.end();
            return;
          }
          const unsubscribe = runManager.subscribe(runId, (event) => {
            writeSse(res, event);
            const latest = runManager.getRun(runId);
            if (latest && latest.status !== "queued" && latest.status !== "running") {
              res.end();
            }
          });
          req.on("close", () => {
            unsubscribe?.();
          });
          return;
        }
        if (method === "POST" && action === "abort") {
          const run = runManager.abort(runId);
          if (!run) {
            sendJson(res, 404, { error: "Run not found." });
            return;
          }
          sendJson(res, 200, run);
          return;
        }
      }

      sendJson(res, 404, { error: "Not found." });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(res, 400, { error: message });
    }
  });

  const boundPort = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(desiredPort, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve server address."));
        return;
      }
      resolve(address.port);
    });
  });

  return {
    server,
    runManager,
    host,
    port: boundPort,
    baseUrl: `http://${host}:${boundPort}`,
    close: async () =>
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}
