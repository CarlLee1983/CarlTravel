import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { buildSearchIndex } from "../scripts/search-index.ts";
import { inspectIndex } from "../scripts/publish/isolation.ts";
import { workspace } from "./helpers/workspace.ts";

test(
  "index rebuild returns complete readable files after closing its native service",
  { timeout: 120_000 },
  async () => {
    const { root, cleanup } = await workspace();
    try {
      const output = join(root, "dist");
      await mkdir(join(output, "spots/approved-park"), { recursive: true });
      await writeFile(
        join(output, "spots/approved-park/index.html"),
        '<html lang="zh-Hant"><body><main data-pagefind-body><h1>durableindexprobe</h1></main></body></html>',
      );
      for (let revision = 0; revision < 10; revision++) {
        await buildSearchIndex(join(root, "content/spots"), output);
        const entry = JSON.parse(
          await readFile(join(output, "pagefind/pagefind-entry.json"), "utf8"),
        );
        assert.equal(entry.languages["zh-Hant"].page_count, 1);
        for (const file of await readdir(join(output, "pagefind/fragment")))
          assert.ok(
            (await readFile(join(output, "pagefind/fragment", file))).length >
              0,
          );
      }
      const index = await inspectIndex(output, ["durableindexprobe"]);
      assert.deepEqual(index.matches.durableindexprobe, [
        "/spots/approved-park/",
      ]);
    } finally {
      await cleanup();
    }
  },
);
