import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { workspace } from "./helpers/workspace.ts";
import { initOfficial } from "../scripts/research/official.ts";
import { checkResearch } from "../scripts/research/check.ts";
import { initResearch, captureOriginal } from "../scripts/research/records.ts";
import {
  snapshot,
  checkBatch,
  checkPublicText,
} from "../scripts/publish/batch.ts";

async function selected(root: string, id: string, notes = "無") {
  await initOfficial(root, "2026-10-15", id, notes);
  const dir = join(root, "research/official", id);
  const path = join(dir, "record.md");
  await writeFile(
    path,
    (await readFile(path, "utf8"))
      .replace("## Carl 勾選日期\n未核准", "## Carl 勾選日期\n2026-10-15")
      .replace(
        "## Carl 勾選\n未核准",
        "## Carl 勾選\n已勾選\n虛構測試勾選，非實際使用者決定。",
      ),
  );
  await writeFile(
    join(dir, "official-log.md"),
    "# 官方查證\n\n2026-10-15：測試官方頁 https://example.org/park 說明步道開放。\n",
  );
}

async function draft(root: string, id = "official-park") {
  const data = parse(
    await readFile(join(root, "content/spots/approved-park/spot.yaml"), "utf8"),
  );
  await mkdir(join(root, "drafts/spots", id), { recursive: true });
  const file = join(root, "drafts/spots", id, "spot.yaml");
  await writeFile(file, stringify(data));
  return { data, file };
}

test("official-only requires local selection and evidence, reports no travel original, and protects notes across drafts", async () => {
  const { root, cleanup } = await workspace();
  try {
    await draft(root);
    assert.equal((await checkResearch(root, ["official-park"])).ok, false);
    const secret = "甲乙丙丁戊己庚辛壬癸子丑";
    await selected(root, "official-park", secret);
    let result = await checkResearch(root, ["official-park"]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.sources, []);
    assert.deepEqual(result.officialOnly, [
      { id: "official-park", original: "not_applicable", notes: "pass" },
    ]);
    await assert.rejects(
      initOfficial(root, "2026-10-15", "official-park", "替換備註"),
    );
    const other = await draft(root, "other-park");
    await selected(root, "other-park");
    other.data.summary = secret;
    await writeFile(other.file, stringify(other.data));
    result = await checkResearch(root, ["other-park"]);
    assert.equal(result.ok, false);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
    await assert.rejects(
      checkPublicText(root, ["other-park"], [secret]),
      /私人備註/,
    );
    await writeFile(
      other.file,
      stringify({ ...other.data, summary: "可觀察植物的公園。" }),
    );
    const log = join(root, "research/official/other-park/official-log.md");
    await writeFile(log, "# 官方查證\n\n尚未查證。\n");
    assert.equal((await checkResearch(root, ["other-park"])).ok, false);
    await writeFile(log, "# 官方查證\n");
    assert.equal((await checkResearch(root, ["other-park"])).ok, false);
    await rm(log);
    await symlink(
      join(root, "research/official/official-park/official-log.md"),
      log,
    );
    assert.equal((await checkResearch(root, ["other-park"])).ok, false);
  } finally {
    await cleanup();
  }
});

test("dropping travel references cannot hide retained original overlap or lost evidence", async () => {
  const { root, cleanup } = await workspace();
  try {
    const { data, file } = await draft(root);
    await selected(root, "official-park");
    const source = await initResearch(
      root,
      "2026-10-15",
      "retained",
      "https://example.org/story",
    );
    const phrase = "甲乙丙丁戊己庚辛壬癸子丑";
    const input = join(root, "input.txt");
    await writeFile(input, phrase + "。其他完整虛構原文。");
    await captureOriginal(root, source, "carl", input);
    data.summary = phrase;
    await writeFile(file, stringify(data));
    assert.equal((await checkResearch(root, ["official-park"])).ok, false);
    data.summary = "沿步道觀察植物。";
    await writeFile(file, stringify(data));
    assert.equal((await checkResearch(root, ["official-park"])).ok, true);
    const recordPath = join(root, "research", source, "source.md");
    const record = await readFile(recordPath, "utf8");
    await rm(recordPath);
    assert.equal((await checkResearch(root, ["official-park"])).ok, false);
    await assert.rejects(
      checkPublicText(root, ["official-park"], [phrase]),
      /來源紀錄已遺失/,
    );
    await writeFile(recordPath, record);
    await rm(join(root, "research", source, "original.txt"));
    assert.equal((await checkResearch(root, ["official-park"])).ok, false);
  } finally {
    await cleanup();
  }
});

test("mixed official and travel drafts still require valid travel evidence", async () => {
  const { root, cleanup } = await workspace();
  try {
    await draft(root);
    await selected(root, "official-park");
    const other = await draft(root, "travel-park");
    const source = await initResearch(
      root,
      "2026-10-15",
      "travel",
      "https://example.org/travel",
    );
    other.data.sources = [
      {
        id: source,
        title: "測試來源",
        author: "測試作者",
        url: "https://example.org/travel",
        readAt: "2026-10-15",
        readable: true,
      },
    ];
    other.data.authorNotes = [{ source, summary: "作者記錄步道景色。" }];
    await writeFile(other.file, stringify(other.data));
    assert.equal(
      (await checkResearch(root, ["official-park", "travel-park"])).ok,
      false,
    );
    const input = join(root, "input.txt");
    await writeFile(input, "完全虛構的旅程內容供測試保留。");
    await captureOriginal(root, source, "carl", input);
    const result = await checkResearch(root, ["official-park", "travel-park"]);
    assert.equal(result.ok, true);
    assert.equal(result.sources[0]!.original, "pass");
    assert.equal(result.officialOnly[0]!.original, "not_applicable");
  } finally {
    await cleanup();
  }
});

test(
  "official-only publishing retains content approval and emits truthful public evidence",
  { timeout: 120_000 },
  async () => {
    const { root, cleanup } = await workspace();
    try {
      const formalPath = join(root, "content/spots/approved-park/spot.yaml");
      const formal = parse(await readFile(formalPath, "utf8"));
      formal.name = "已發布測試公園";
      await writeFile(formalPath, stringify(formal));
      const { file, data } = await draft(root);
      data.name = "官方研究公園";
      await writeFile(file, stringify(data));
      await selected(root, "official-park");
      await snapshot(root, "official-batch", ["official-park"]);
      await assert.rejects(checkBatch(root, "official-batch"), /核准/);
      const path = join(root, "research/publish/official-batch/approval.md");
      await writeFile(
        path,
        (await readFile(path, "utf8"))
          .replace("## Carl 核准日期\n未核准", "## Carl 核准日期\n2026-10-15")
          .replace(
            "## Carl 決定\n未核准",
            "## Carl 決定\n核准\n虛構測試核准，非使用者實際決定。",
          ),
      );
      const result = await checkBatch(root, "official-batch");
      assert.match(result.body, /official_only; original=not_applicable/);
      assert.doesNotMatch(
        result.body,
        /original=pass|虛構測試核准|research\/official/,
      );
      assert.deepEqual(result.sources, []);
      await writeFile(file, (await readFile(file, "utf8")) + "# changed\n");
      await assert.rejects(checkBatch(root, "official-batch"), /核准版本/);
    } finally {
      await cleanup();
    }
  },
);
