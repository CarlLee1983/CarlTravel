import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { workspace, devServer } from "./helpers/workspace.ts";
import { buildSearchIndex } from "../scripts/search-index.ts";
import { checkIsolation } from "../scripts/publish/isolation.ts";

test(
  "formal pages, sitemap and real Pagefind exclude new and revised drafts after preview",
  { timeout: 120_000 },
  async () => {
    const { root, cleanup } = await workspace();
    const original = (
      await readFile(
        join(root, "content/spots/approved-park/spot.yaml"),
        "utf8",
      )
    ).replace("範例親子公園", "已發布測試公園");
    await writeFile(
      join(root, "content/spots/approved-park/spot.yaml"),
      original,
    );
    for (const [id, name] of [
      ["approved-park", "revisionprivateprobe"],
      ["new-draft", "newprivateprobe"],
    ]) {
      await mkdir(join(root, "drafts/spots", id!), { recursive: true });
      await writeFile(
        join(root, "drafts/spots", id!, "spot.yaml"),
        original.replace("已發布測試公園", name!),
      );
    }
    const server = await devServer(root);
    try {
      await server.waitFor("/spots/approved-park/", (html) =>
        html.includes("revisionprivateprobe"),
      );
      await server.waitFor("/spots/new-draft/", (html) =>
        html.includes("newprivateprobe"),
      );
      await server.stop();
      execFileSync(process.execPath, ["scripts/site.mjs", "build"], {
        cwd: root,
        stdio: "pipe",
        timeout: 60_000,
      });
      const result = await checkIsolation(root);
      assert.deepEqual(result.urls, ["/spots/approved-park/"]);
      assert.deepEqual(result.matches.revisionprivateprobe, []);
      assert.deepEqual(result.matches.newprivateprobe, []);
      assert.deepEqual(result.matches["已發布測試公園"], [
        "/spots/approved-park/",
      ]);
      const home = join(root, "dist/index.html");
      const originalHome = await readFile(home, "utf8");
      await writeFile(
        home,
        originalHome + '<a href="/spots/new-draft/">link</a>',
      );
      await assert.rejects(checkIsolation(root), /草稿連結/);
      await writeFile(home, originalHome);
      const page = join(root, "dist/spots/approved-park/index.html");
      const html = await readFile(page, "utf8");
      await writeFile(
        page,
        html.replaceAll("已發布測試公園", "revisionprivateprobe"),
      );
      await assert.rejects(checkIsolation(root), /草稿/);
      await buildSearchIndex(join(root, "content/spots"), join(root, "dist"));
      await writeFile(page, html);
      await assert.rejects(checkIsolation(root), /草稿/);
      const cli = spawnSync(
        process.execPath,
        ["--experimental-strip-types", "scripts/check-index.ts"],
        { cwd: root, encoding: "utf8" },
      );
      assert.equal(cli.status, 1);
      assert.doesNotMatch(cli.stdout + cli.stderr, /revisionprivateprobe/);
      assert.match(
        await readFile(join(root, "research/isolation-report.md"), "utf8"),
        /revisionprivateprobe/,
      );
    } finally {
      await server.stop();
      await cleanup();
    }
  },
);
