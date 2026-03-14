import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyPatchToWorkspace, parseApplyPatch } from "../src/tools/apply-patch.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("apply_patch tool", () => {
  it("parses add/update/delete operations", () => {
    const operations = parseApplyPatch(`*** Begin Patch
*** Add File: notes.txt
+hello
*** Update File: app.txt
@@
-old
+new
*** Delete File: stale.txt
*** End Patch`);

    expect(operations).toHaveLength(3);
    expect(operations[0]?.kind).toBe("add");
    expect(operations[1]?.kind).toBe("update");
    expect(operations[2]?.kind).toBe("delete");
  });

  it("applies update and add operations inside the workspace root", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "companyclaw-patch-"));
    tempDirs.push(tempDir);
    await fs.writeFile(path.join(tempDir, "app.txt"), "old\nline\n", "utf8");

    const summary = await applyPatchToWorkspace({
      root: tempDir,
      input: `*** Begin Patch
*** Update File: app.txt
@@
-old
+new
*** Add File: notes.txt
+first line
+second line
*** End Patch`,
    });

    const appText = await fs.readFile(path.join(tempDir, "app.txt"), "utf8");
    const notesText = await fs.readFile(path.join(tempDir, "notes.txt"), "utf8");

    expect(appText).toContain("new");
    expect(notesText).toBe("first line\nsecond line");
    expect(summary).toContain("M app.txt");
    expect(summary).toContain("A notes.txt");
  });
});
