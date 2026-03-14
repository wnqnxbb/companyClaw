import type {
  AgentTool,
  AgentToolResult,
  AgentToolUpdateCallback,
} from "@mariozechner/pi-agent-core";
import {
  createEditTool,
  createReadTool,
  createWriteTool,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { resolveWithinRoot } from "../fs-utils.js";
import type { RuntimeTool } from "../types.js";
import { createApplyPatchTool } from "./apply-patch.js";
import { createExecTool } from "./exec.js";

type ToolExecuteArgsCurrent = [
  string,
  unknown,
  AbortSignal | undefined,
  AgentToolUpdateCallback<unknown> | undefined,
];

function isAbortSignal(value: unknown): value is AbortSignal {
  return typeof value === "object" && value !== null && "aborted" in value;
}

function normalizeToolResult(result: unknown): AgentToolResult<unknown> {
  if (result && typeof result === "object" && Array.isArray((result as { content?: unknown }).content)) {
    return result as AgentToolResult<unknown>;
  }

  const text =
    typeof result === "string"
      ? result
      : JSON.stringify(result ?? { status: "ok" }, null, 2);
  return {
    content: [{ type: "text", text }],
    details: result,
  };
}

export function toToolDefinitions(tools: RuntimeTool[]): ToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    label: tool.label ?? tool.name,
    description: tool.description ?? "",
    parameters: tool.parameters as ToolDefinition["parameters"],
    execute: async (...rawArgs: unknown[]) => {
      const [toolCallId, params, third, fourth] = rawArgs as ToolExecuteArgsCurrent;
      const signal = isAbortSignal(third) ? third : undefined;
      const onUpdate = typeof fourth === "function" ? fourth : undefined;
      return normalizeToolResult(
        await tool.execute(
          toolCallId,
          params,
          signal,
          onUpdate as unknown as ((update: unknown) => void) | undefined,
        ),
      );
    },
  }));
}

function wrapWorkspacePathGuard(tool: RuntimeTool, workspaceDir: string): RuntimeTool {
  return {
    ...tool,
    execute: async (toolCallId, rawArgs, signal, onUpdate) => {
      const args =
        rawArgs && typeof rawArgs === "object" ? { ...(rawArgs as Record<string, unknown>) } : rawArgs;
      if (args && typeof args === "object" && "path" in args && typeof args.path === "string") {
        resolveWithinRoot(workspaceDir, String(args.path));
      }
      return await tool.execute(
        toolCallId,
        args,
        signal,
        onUpdate as unknown as ((update: unknown) => void) | undefined,
      );
    },
  };
}

export function createRuntimeTools(options: {
  workspaceDir: string;
  execTimeoutMs: number;
}): RuntimeTool[] {
  const readTool = createReadTool(options.workspaceDir) as unknown as AgentTool;
  const writeTool = createWriteTool(options.workspaceDir) as unknown as AgentTool;
  const editTool = createEditTool(options.workspaceDir) as unknown as AgentTool;

  return [
    wrapWorkspacePathGuard(readTool as unknown as RuntimeTool, options.workspaceDir),
    wrapWorkspacePathGuard(writeTool as unknown as RuntimeTool, options.workspaceDir),
    wrapWorkspacePathGuard(editTool as unknown as RuntimeTool, options.workspaceDir),
    createApplyPatchTool({ workspaceDir: options.workspaceDir }),
    createExecTool({
      workspaceDir: options.workspaceDir,
      defaultTimeoutMs: options.execTimeoutMs,
    }),
  ];
}
