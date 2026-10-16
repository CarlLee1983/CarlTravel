import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBuildSpots } from "../src/content/build-spots.ts";

test("同一個根目錄在一次建置中只載入一次，之後共用同一份結果", async () => {
  const parent = await mkdtemp(join(tmpdir(), "carltravel-once-"));
  const root = join(parent, "spots");
  try {
    await cp("tests/fixtures/spots", root, { recursive: true });
    const first = await loadBuildSpots(root);
    // 載入後改動檔案；若再次讀檔，名稱或驗證結果會不同。
    const file = join(root, "example-park/spot.yaml");
    await writeFile(
      file,
      (await readFile(file, "utf8")).replace("範例親子公園", "已被改動"),
    );
    const second = await loadBuildSpots(root);
    assert.equal(second, first);
    assert.equal(second[0]!.name, "範例親子公園");
    // 驗證失敗的內容不會因為快取而被略過：另一個根目錄獨立載入。
    await assert.rejects(loadBuildSpots(join(parent, "missing")), /ENOENT/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
