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

test(
  "index treats 台 and 臺 as one character and maps every hit id to its spot id without fragments",
  { timeout: 120_000 },
  async () => {
    const { root, cleanup } = await workspace();
    try {
      const output = join(root, "dist");
      await mkdir(join(output, "spots/approved-park"), { recursive: true });
      await writeFile(
        join(output, "spots/approved-park/index.html"),
        '<html lang="zh-Hant"><body><main data-pagefind-body><h1>臺北samevariantprobe</h1></main></body></html>',
      );
      await buildSearchIndex(join(root, "content/spots"), output);
      const index = await inspectIndex(output, [
        "台北samevariantprobe",
        "臺北samevariantprobe",
      ]);
      assert.deepEqual(index.matches["台北samevariantprobe"], [
        "/spots/approved-park/",
      ]);
      assert.deepEqual(index.matches["臺北samevariantprobe"], [
        "/spots/approved-park/",
      ]);
      const map = JSON.parse(
        await readFile(join(output, "pagefind/spot-ids.json"), "utf8"),
      );
      const fragments = await readdir(join(output, "pagefind/fragment"));
      assert.deepEqual(Object.values(map), ["approved-park"]);
      assert.deepEqual(
        fragments.map((name) => name.replace(/\.pf_fragment$/, "")),
        Object.keys(map),
      );
    } finally {
      await cleanup();
    }
  },
);
