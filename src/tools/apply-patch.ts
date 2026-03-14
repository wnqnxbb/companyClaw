import fs from "node:fs/promises";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import type { RuntimeTool } from "../types.js";
import { ensureDir, joinLines, resolveWithinRoot, splitLines } from "../fs-utils.js";

const BEGIN_PATCH = "*** Begin Patch";
const END_PATCH = "*** End Patch";
const ADD_FILE = "*** Add File: ";
const DELETE_FILE = "*** Delete File: ";
const UPDATE_FILE = "*** Update File: ";
const MOVE_TO = "*** Move to: ";
const EOF_MARKER = "*** End of File";

type AddPatch = {
  kind: "add";
  filePath: string;
  contents: string;
};

type DeletePatch = {
  kind: "delete";
  filePath: string;
};

type UpdateChunk = {
  before: string[];
  after: string[];
};

type UpdatePatch = {
  kind: "update";
  filePath: string;
  moveTo?: string;
  chunks: UpdateChunk[];
};

type PatchOperation = AddPatch | DeletePatch | UpdatePatch;

const applyPatchSchema = Type.Object({
  input: Type.String({ description: "Patch text in apply_patch format." }),
});

function isOperationStart(line: string): boolean {
  return (
    line.startsWith(ADD_FILE) ||
    line.startsWith(DELETE_FILE) ||
    line.startsWith(UPDATE_FILE) ||
    line === END_PATCH
  );
}

function findSequenceIndex(haystack: string[], needle: string[], start: number): number {
  if (needle.length === 0) {
    return start;
  }
  for (let index = start; index <= haystack.length - needle.length; index += 1) {
    let matches = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return index;
    }
  }
  return -1;
}

function parseUpdateChunk(lines: string[]): UpdateChunk {
  const before: string[] = [];
  const after: string[] = [];
  for (const line of lines) {
    if (!line) {
      throw new Error("Malformed patch line.");
    }
    const marker = line[0];
    const content = line.slice(1);
    if (marker !== "+" && marker !== "-" && marker !== " ") {
      throw new Error(`Unsupported patch marker: ${line}`);
    }
    if (marker !== "+") {
      before.push(content);
    }
    if (marker !== "-") {
      after.push(content);
    }
  }
  return { before, after };
}

export function parseApplyPatch(input: string): PatchOperation[] {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== BEGIN_PATCH) {
    throw new Error("Patch must start with *** Begin Patch.");
  }

  const operations: PatchOperation[] = [];
  let index = 1;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line === END_PATCH) {
      return operations;
    }
    if (line.startsWith(ADD_FILE)) {
      const filePath = line.slice(ADD_FILE.length).trim();
      index += 1;
      const contents: string[] = [];
      while (index < lines.length && !isOperationStart(lines[index] ?? "")) {
        const current = lines[index] ?? "";
        if (!current.startsWith("+")) {
          throw new Error(`Add File blocks only accept '+' lines: ${current}`);
        }
        contents.push(current.slice(1));
        index += 1;
      }
      operations.push({
        kind: "add",
        filePath,
        contents: contents.join("\n"),
      });
      continue;
    }
    if (line.startsWith(DELETE_FILE)) {
      operations.push({
        kind: "delete",
        filePath: line.slice(DELETE_FILE.length).trim(),
      });
      index += 1;
      continue;
    }
    if (line.startsWith(UPDATE_FILE)) {
      const filePath = line.slice(UPDATE_FILE.length).trim();
      index += 1;
      let moveTo: string | undefined;
      if ((lines[index] ?? "").startsWith(MOVE_TO)) {
        moveTo = (lines[index] ?? "").slice(MOVE_TO.length).trim();
        index += 1;
      }
      const chunks: UpdateChunk[] = [];
      while (index < lines.length && !isOperationStart(lines[index] ?? "")) {
        const header = lines[index] ?? "";
        if (!header.startsWith("@@")) {
          throw new Error(`Update chunk must start with @@, got: ${header}`);
        }
        index += 1;
        const chunkLines: string[] = [];
        while (index < lines.length) {
          const current = lines[index] ?? "";
          if (
            current.startsWith("@@") ||
            current === END_PATCH ||
            current.startsWith(ADD_FILE) ||
            current.startsWith(DELETE_FILE) ||
            current.startsWith(UPDATE_FILE)
          ) {
            break;
          }
          if (current === EOF_MARKER) {
            index += 1;
            break;
          }
          chunkLines.push(current);
          index += 1;
        }
        chunks.push(parseUpdateChunk(chunkLines));
      }
      operations.push({
        kind: "update",
        filePath,
        moveTo,
        chunks,
      });
      continue;
    }
    throw new Error(`Unknown patch line: ${line}`);
  }

  throw new Error("Patch is missing *** End Patch.");
}

async function applyUpdatePatch(params: {
  root: string;
  operation: UpdatePatch;
}): Promise<string> {
  const targetPath = resolveWithinRoot(params.root, params.operation.filePath);
  const current = await fs.readFile(targetPath, "utf8");
  const original = splitLines(current);
  let lines = [...original.lines];
  let cursor = 0;

  for (const chunk of params.operation.chunks) {
    const foundAt = findSequenceIndex(lines, chunk.before, cursor);
    if (foundAt < 0) {
      const fallbackIndex = findSequenceIndex(lines, chunk.before, 0);
      if (fallbackIndex < 0) {
        throw new Error(`Failed to apply patch for ${params.operation.filePath}`);
      }
      cursor = fallbackIndex;
    } else {
      cursor = foundAt;
    }
    lines = [
      ...lines.slice(0, cursor),
      ...chunk.after,
      ...lines.slice(cursor + chunk.before.length),
    ];
    cursor += chunk.after.length;
  }

  return joinLines(lines, original.hasTrailingNewline);
}

export async function applyPatchToWorkspace(params: {
  root: string;
  input: string;
}): Promise<string> {
  const operations = parseApplyPatch(params.input);
  const summary: string[] = [];

  for (const operation of operations) {
    if (operation.kind === "add") {
      const targetPath = resolveWithinRoot(params.root, operation.filePath);
      await ensureDir(path.dirname(targetPath));
      await fs.writeFile(targetPath, operation.contents, "utf8");
      summary.push(`A ${operation.filePath}`);
      continue;
    }

    if (operation.kind === "delete") {
      const targetPath = resolveWithinRoot(params.root, operation.filePath);
      await fs.rm(targetPath, { force: true });
      summary.push(`D ${operation.filePath}`);
      continue;
    }

    const nextContent = await applyUpdatePatch({
      root: params.root,
      operation,
    });
    const targetPath = resolveWithinRoot(params.root, operation.filePath);
    if (operation.moveTo) {
      const movedPath = resolveWithinRoot(params.root, operation.moveTo);
      await ensureDir(path.dirname(movedPath));
      await fs.writeFile(movedPath, nextContent, "utf8");
      await fs.rm(targetPath, { force: true });
      summary.push(`M ${operation.moveTo}`);
    } else {
      await fs.writeFile(targetPath, nextContent, "utf8");
      summary.push(`M ${operation.filePath}`);
    }
  }

  return ["Success. Updated the following files:", ...summary].join("\n");
}

export function createApplyPatchTool(options: { workspaceDir: string }): RuntimeTool {
  return {
    name: "apply_patch",
    label: "apply_patch",
    description: "Apply a multi-file patch using the apply_patch format.",
    parameters: applyPatchSchema,
    execute: async (_toolCallId, rawArgs) => {
      const args = rawArgs as { input?: string };
      const input = args.input?.trim();
      if (!input) {
        throw new Error("apply_patch requires non-empty input.");
      }
      const text = await applyPatchToWorkspace({
        root: options.workspaceDir,
        input,
      });
      return {
        content: [{ type: "text", text }],
      };
    },
  };
}
