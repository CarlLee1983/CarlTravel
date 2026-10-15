import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  writeFile,
  symlink,
  rm,
  copyFile,
  mkdtemp,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { checkPublicAssets } from "../scripts/private-assets.ts";
import { join } from "node:path";
import { workspace } from "./helpers/workspace.ts";

test(
  "public assets cannot bypass private directory and image restrictions",
  { timeout: 60_000 },
  async () => {
    const { root, cleanup } = await workspace();
    const sync = () =>
      execFileSync(
        process.execPath,
        ["node_modules/astro/bin/astro.mjs", "sync"],
        {
          cwd: root,
          encoding: "utf8",
          stdio: "pipe",
        },
      );
    try {
      await mkdir(join(root, "public/research"), { recursive: true });
      await writeFile(
        join(root, "public/research/original.txt"),
        "syntheticprivateprobe",
      );
      assert.throws(sync, /public.*research.*私人目錄/s);
      await rm(join(root, "public/research"), { recursive: true });
      await mkdir(join(root, "research"));
      await symlink(join(root, "research"), join(root, "public/alias"), "dir");
      assert.throws(sync, /public.*alias.*符號連結/s);
      await rm(join(root, "public/alias"));
      await writeFile(join(root, "public/photo.png"), "syntheticimageprobe");
      assert.throws(sync, /public.*photo.png.*圖片/s);
    } finally {
      await cleanup();
    }
  },
);

test("public artwork allowance requires approved bytes and exact path without symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "carltravel-artwork-"));
  const original = "public/illustrations/family-outing.png";
  const allowed = join(root, "illustrations/family-outing.png");
  try {
    await mkdir(join(root, "illustrations"));
    await copyFile(original, allowed);
    await checkPublicAssets(root);
    for (const name of [
      "extra.png",
      "illustrations/renamed.png",
      "nested/illustrations/family-outing.png",
    ]) {
      const target = join(root, name);
      await mkdir(join(target, ".."), { recursive: true });
      await copyFile(original, target);
      await assert.rejects(checkPublicAssets(root), /圖片/);
      await rm(target);
    }
    await writeFile(allowed, "unreviewed replacement");
    await assert.rejects(checkPublicAssets(root), /圖片/);
    await rm(allowed);
    await symlink(join(process.cwd(), original), allowed);
    await assert.rejects(checkPublicAssets(root), /符號連結/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
