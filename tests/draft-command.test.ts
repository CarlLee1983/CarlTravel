import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { workspace } from "./helpers/workspace.ts";

test("copy a published spot to a private revision and inspect its diff without changing formal content", async () => {
  const { root, cleanup } = await workspace();
  const run = (...args: string[]) =>
    execFileSync(
      process.execPath,
      ["--experimental-strip-types", "scripts/draft.ts", ...args],
      { cwd: root, encoding: "utf8", stdio: "pipe" },
    );
  try {
    const formal = join(root, "content/spots/approved-park/spot.yaml");
    const original = await readFile(formal, "utf8");
    run("copy", "approved-park");
    const draft = join(root, "drafts/spots/approved-park/spot.yaml");
    assert.equal(await readFile(draft, "utf8"), original);
    await writeFile(draft, original.replace("範例親子公園", "修訂中的公園"));
    const diff = run("diff", "approved-park");
    assert.match(diff, /-name: 範例親子公園/);
    assert.match(diff, /\+name: 修訂中的公園/);
    assert.equal(await readFile(formal, "utf8"), original);
    assert.throws(() => run("copy", "approved-park"), /已存在/);
    assert.match(await readFile(draft, "utf8"), /修訂中的公園/);
  } finally {
    await cleanup();
  }
});

test("draft commands reject traversal, missing formal spots, invalid revisions, attachments and linked private roots", async () => {
  const { root, cleanup } = await workspace();
  const run = (...args: string[]) =>
    execFileSync(
      process.execPath,
      ["--experimental-strip-types", "scripts/draft.ts", ...args],
      { cwd: root, encoding: "utf8", stdio: "pipe" },
    );
  try {
    assert.throws(() => run("copy", "../../outside"), /Usage/);
    assert.throws(() => run("copy", "missing"), /找不到正式景點/);
    run("copy", "approved-park");
    const draft = join(root, "drafts/spots/approved-park/spot.yaml");
    const original = await readFile(draft, "utf8");
    await writeFile(
      draft,
      original.replace("county: 臺北市", "county: 不存在市"),
    );
    assert.throws(() => run("diff", "approved-park"), /county/);
    await writeFile(draft, original);
    await writeFile(
      join(root, "drafts/spots/approved-park/photo.png"),
      "syntheticimageprobe",
    );
    assert.throws(() => run("diff", "approved-park"), /圖片或其他附件/);
  } finally {
    await cleanup();
  }
  const linked = await workspace();
  try {
    await mkdir(join(linked.root, "private-store"));
    await symlink(
      join(linked.root, "private-store"),
      join(linked.root, "drafts"),
      "dir",
    );
    const run = (...args: string[]) =>
      execFileSync(
        process.execPath,
        ["--experimental-strip-types", "scripts/draft.ts", ...args],
        { cwd: linked.root, encoding: "utf8", stdio: "pipe" },
      );
    assert.throws(() => run("copy", "approved-park"), /符號連結/);
    await mkdir(join(linked.root, "private-store/spots/approved-park"), {
      recursive: true,
    });
    await writeFile(
      join(linked.root, "private-store/spots/approved-park/spot.yaml"),
      await readFile(
        join(linked.root, "content/spots/approved-park/spot.yaml"),
      ),
    );
    assert.throws(() => run("diff", "approved-park"), /符號連結/);
  } finally {
    await linked.cleanup();
  }
});
