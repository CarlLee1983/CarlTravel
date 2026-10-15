import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
  link,
} from "node:fs/promises";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { writeLocal } from "../scripts/research/files.ts";
import { matchIdentity } from "../scripts/research/identity.ts";
import { checkResearch } from "../scripts/research/check.ts";
import { workspace } from "./helpers/workspace.ts";
import {
  initResearch,
  captureOriginal,
  recordAttempt,
  acceptUnreadable,
} from "../scripts/research/records.ts";

test("research IDs reserve collisions across records and formal/draft sources and capture original locally", async () => {
  const { root, cleanup } = await workspace();
  try {
    const formalFile = join(root, "content/spots/approved-park/spot.yaml");
    const formal = parse(await readFile(formalFile, "utf8"));
    formal.sources = [
      {
        id: "20261015-example",
        title: "虛構來源",
        author: "範例作者",
        url: "https://example.org/one",
        readAt: "2026-10-15",
        readable: false,
      },
    ];
    await writeFile(formalFile, stringify(formal));
    await mkdir(join(root, "drafts/spots/draft-park"), { recursive: true });
    await writeFile(
      join(root, "drafts/spots/draft-park/spot.yaml"),
      stringify({
        ...formal,
        sources: [{ ...formal.sources[0], id: "20261015-example-2" }],
      }),
    );
    const first = await initResearch(
      root,
      "2026-10-15",
      "example",
      "https://example.org/new",
    );
    assert.equal(first, "20261015-example-3");
    assert.equal(
      await initResearch(
        root,
        "2026-10-15",
        "example",
        "https://example.org/new",
      ),
      "20261015-example-4",
    );
    const input = join(root, "supplied.txt");
    await writeFile(input, "虛構作者的完整來源文字。\n保留原文供本機檢查。");
    await captureOriginal(root, first, "defuddle", input);
    assert.equal(
      await readFile(join(root, "research", first, "original.txt"), "utf8"),
      await readFile(input, "utf8"),
    );
    assert.match(
      await readFile(join(root, "research", first, "source.md"), "utf8"),
      /原文已保存/,
    );
    await assert.rejects(
      captureOriginal(root, first, "defuddle", input),
      /已存在/,
    );
    assert.deepEqual(parse(await readFile(formalFile, "utf8")), formal);
  } finally {
    await cleanup();
  }
});

test("local overlap gate separates quote permission from private-note leakage and keeps details out of its result", async () => {
  const { root, cleanup } = await workspace();
  try {
    const id = await initResearch(
      root,
      "2026-10-15",
      "writer",
      "https://example.org/story",
    );
    const input = join(root, "original-input.txt");
    const phrase = "甲乙丙丁戊己庚辛壬癸子丑";
    await writeFile(
      input,
      phrase + " https://example.org/story 來源標題同樣屬於公開文字示例",
    );
    await captureOriginal(root, id, "defuddle", input);
    const data = parse(
      await readFile(
        join(root, "content/spots/approved-park/spot.yaml"),
        "utf8",
      ),
    );
    data.sources = [
      {
        id,
        title: "虛構來源",
        author: "範例作者",
        url: "https://example.org/story",
        readAt: "2026-10-15",
        readable: true,
      },
    ];
    data.authorNotes = [
      { source: id, summary: "作者描述步道旁的植物觀察。", quotes: [phrase] },
    ];
    await mkdir(join(root, "drafts/spots/approved-park"), { recursive: true });
    const file = join(root, "drafts/spots/approved-park/spot.yaml");
    await writeFile(file, stringify(data));
    let result = await checkResearch(root, ["approved-park"]);
    assert.equal(result.ok, true);
    assert.equal(result.sources[0]!.original, "pass");
    data.summary = phrase;
    await writeFile(file, stringify(data));
    result = await checkResearch(root, ["approved-park"]);
    assert.equal(result.ok, false);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(phrase));
    assert.match(
      await readFile(join(root, "research/overlap-report.md"), "utf8"),
      /summary.*甲乙丙丁戊己庚辛壬癸子丑/,
    );
    data.summary = phrase.slice(0, 6);
    data.agentTips = [phrase.slice(6)];
    await writeFile(file, stringify(data));
    assert.equal((await checkResearch(root, ["approved-park"])).ok, true);
    data.sources[0].title = "來源標題同樣屬於公開文字示例";
    await writeFile(file, stringify(data));
    assert.equal((await checkResearch(root, ["approved-park"])).ok, false);
    data.sources[0].title = "虛構來源";
    data.summary = "觀察植物與步道。";
    await writeFile(file, stringify(data));
    const sourceFile = join(root, "research", id, "source.md");
    await writeFile(
      sourceFile,
      (await readFile(sourceFile, "utf8")).replace(
        "## Carl 備註\n無",
        `## Carl 備註\n${phrase}`,
      ),
    );
    result = await checkResearch(root, ["approved-park"]);
    assert.equal(result.ok, false);
    assert.equal(result.sources[0]!.notes, "fail");
    assert.match(
      await readFile(join(root, "research/overlap-report.md"), "utf8"),
      /authorNotes\.0\.quotes\.0/,
    );
  } finally {
    await cleanup();
  }
});

test("mixed sources distinguish approved unreadable from lost or relabeled originals and still check all notes", async () => {
  const { root, cleanup } = await workspace();
  try {
    const a = await initResearch(
      root,
      "2026-10-15",
      "readable",
      "https://example.org/a",
    );
    const b = await initResearch(
      root,
      "2026-10-15",
      "unreadable",
      "https://example.org/b",
    );
    const input = join(root, "input.txt");
    await writeFile(input, "作者的完整原文包含山谷與季節觀察。");
    await captureOriginal(root, a, "defuddle", input);
    const source = (id: string, suffix: string, readable: boolean) => ({
      id,
      title: `虛構來源${suffix}`,
      author: "範例作者",
      url: `https://example.org/${suffix}`,
      readAt: "2026-10-15",
      readable,
    });
    const data = parse(
      await readFile(
        join(root, "content/spots/approved-park/spot.yaml"),
        "utf8",
      ),
    );
    const secret = "甲乙丙丁戊己庚辛壬癸子丑";
    data.sources = [source(a, "a", true), source(b, "b", false)];
    data.authorNotes = [
      { source: a, summary: "觀察植物與步道的記錄。", quotes: [secret] },
    ];
    await mkdir(join(root, "drafts/spots/review-park"), { recursive: true });
    const file = join(root, "drafts/spots/review-park/spot.yaml");
    await writeFile(file, stringify(data));
    assert.equal((await checkResearch(root, ["review-park"])).ok, false);
    await assert.rejects(
      acceptUnreadable(root, b, "2026-10-15", "虛構決定：Carl 接受不可讀。"),
      /讀取嘗試/,
    );
    for (const method of ["defuddle", "WebFetch", "browser"] as const)
      await recordAttempt(root, b, method, "失敗", "虛構情境：頁面拒絕讀取。");
    await acceptUnreadable(
      root,
      b,
      "2026-10-15",
      "虛構決定：Carl 接受不可讀。",
    );
    let result = await checkResearch(root, ["review-park"]);
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.sources.map((s) => s.original),
      ["pass", "not_run_approved_unreadable"],
    );
    const bfile = join(root, "research", b, "source.md");
    await writeFile(
      bfile,
      (await readFile(bfile, "utf8")).replace(
        "## Carl 備註\n無",
        `## Carl 備註\n${secret}`,
      ),
    );
    result = await checkResearch(root, ["review-park"]);
    assert.equal(result.sources[1]!.notes, "fail");
    assert.equal(result.sources[1]!.original, "not_run_approved_unreadable");
    // An original discovered after approval is still checked, and its later loss blocks.
    await writeFile(input, "觀察植物與步道的記錄甲乙丙丁");
    data.summary = "觀察植物與步道的記錄甲乙丙丁";
    await writeFile(file, stringify(data));
    await captureOriginal(root, b, "defuddle", input);
    result = await checkResearch(root, ["review-park"]);
    assert.equal(result.sources[1]!.original, "fail");
    assert.match(
      await readFile(join(root, "research/overlap-report.md"), "utf8"),
      new RegExp(`${b}: 原文命中`),
    );
    await rm(join(root, "research", b, "original.txt"));
    result = await checkResearch(root, ["review-park"]);
    assert.equal(result.sources[1]!.original, "fail");
    assert.match(
      await readFile(join(root, "research/overlap-report.md"), "utf8"),
      /原文曾取得但已遺失/,
    );
    await rm(join(root, "research", a, "original.txt"));
    data.sources[0].readable = false;
    data.authorNotes = [];
    await writeFile(file, stringify(data));
    await assert.rejects(
      acceptUnreadable(root, a, "2026-10-15", "虛構晚來的改標。"),
      /原文曾取得/,
    );
    result = await checkResearch(root, ["review-park"]);
    assert.equal(result.sources[0]!.original, "fail");
  } finally {
    await cleanup();
  }
});

test("identity comparison reads formal and draft versions and leaves partial or conflicting matches to Carl", async () => {
  const { root, cleanup } = await workspace();
  try {
    const formal = parse(
      await readFile(
        join(root, "content/spots/approved-park/spot.yaml"),
        "utf8",
      ),
    );
    let result = await matchIdentity(root, formal.name, formal.address);
    assert.equal(result.status, "match");
    assert.equal(result.id, "approved-park");
    assert.equal(
      (await matchIdentity(root, formal.name, "不同的地址")).status,
      "needs_decision",
    );
    assert.equal(
      (await matchIdentity(root, "另一個景點", "另一個地址")).status,
      "new",
    );
    const museum = parse(
      await readFile("tests/fixtures/spots/example-museum/spot.yaml", "utf8"),
    );
    await mkdir(join(root, "drafts/spots/another-museum"), { recursive: true });
    await writeFile(
      join(root, "drafts/spots/another-museum/spot.yaml"),
      stringify(museum),
    );
    result = await matchIdentity(
      root,
      "新查到的館名",
      "新查到的地址",
      museum.tourismId.value,
    );
    assert.equal(result.id, "another-museum");
    result = await matchIdentity(
      root,
      formal.name,
      formal.address,
      museum.tourismId.value,
    );
    assert.equal(result.status, "needs_decision");
    assert.equal(result.id, undefined);
    assert.deepEqual(
      new Set(result.matches.map((item) => item.id)),
      new Set(["approved-park", "another-museum"]),
    );
    await writeFile(
      join(root, "drafts/spots/another-museum/spot.yaml"),
      stringify({ ...museum, address: formal.address }),
    );
    result = await matchIdentity(root, formal.name, formal.address);
    assert.equal(result.status, "needs_decision");
    assert.equal(result.id, undefined);
    await writeFile(
      join(root, "drafts/spots/another-museum/spot.yaml"),
      stringify(museum),
    );
    await mkdir(join(root, "drafts/spots/approved-park"));
    await writeFile(
      join(root, "drafts/spots/approved-park/spot.yaml"),
      stringify({ ...formal, name: "草稿中的新名稱" }),
    );
    assert.equal(
      (await matchIdentity(root, formal.name, formal.address)).id,
      "approved-park",
    );
    assert.equal(
      (await matchIdentity(root, "草稿中的新名稱", formal.address)).id,
      "approved-park",
    );
  } finally {
    await cleanup();
  }
});

test("unreadable originals discovered locally are compared, remembered, and cannot later disappear", async () => {
  const { root, cleanup } = await workspace();
  try {
    const id = await initResearch(
      root,
      "2026-10-15",
      "discovered",
      "https://example.org/discovered",
    );
    for (const method of ["defuddle", "WebFetch", "browser"] as const)
      await recordAttempt(
        root,
        id,
        method,
        "工具不可用",
        "虛構驗收：本次環境未提供此工具。",
      );
    await acceptUnreadable(
      root,
      id,
      "2026-10-15",
      "虛構決定：Carl 接受不可讀。",
    );
    const data = parse(
      await readFile(
        join(root, "content/spots/approved-park/spot.yaml"),
        "utf8",
      ),
    );
    data.sources = [
      {
        id,
        title: "虛構來源",
        author: "範例作者",
        url: "https://example.org/discovered",
        readAt: "2026-10-15",
        readable: false,
      },
    ];
    await mkdir(join(root, "drafts/spots/review-park"), { recursive: true });
    await writeFile(
      join(root, "drafts/spots/review-park/spot.yaml"),
      stringify(data),
    );
    const original = join(root, "research", id, "original.txt");
    await writeFile(original, "");
    assert.equal((await checkResearch(root, ["review-park"])).ok, false);
    await writeFile(original, "獨有的虛構閱讀內容：山谷透出一線光芒。");
    const result = await checkResearch(root, ["review-park"]);
    assert.equal(result.ok, true);
    assert.equal(result.sources[0]!.original, "pass");
    assert.match(
      await readFile(join(root, "research", id, "source.md"), "utf8"),
      /本機關卡發現原文/,
    );
    await rm(original);
    assert.equal(
      (await checkResearch(root, ["review-park"])).sources[0]!.original,
      "fail",
    );
  } finally {
    await cleanup();
  }
});

test("private metadata, conflicting source identities, malformed evidence and linked private paths fail closed", async () => {
  const { root, cleanup } = await workspace();
  try {
    const id = await initResearch(
      root,
      "2026-10-15",
      "boundaries",
      "https://example.org/boundaries",
    );
    const input = join(root, "input.txt");
    await writeFile(input, "與景點無關的測試原文段落。");
    await captureOriginal(root, id, "defuddle", input);
    const data = parse(
      await readFile(
        join(root, "content/spots/approved-park/spot.yaml"),
        "utf8",
      ),
    );
    data.sources = [
      {
        id,
        title: "虛構來源",
        author: "範例作者",
        url: "https://example.org/boundaries",
        readAt: "2026-10-15",
        readable: true,
      },
    ];
    data.authorNotes = [
      { source: id, summary: "另外撰寫的簡短景點觀點。", quotes: [] },
    ];
    await mkdir(join(root, "drafts/spots/review-park"), { recursive: true });
    await writeFile(
      join(root, "drafts/spots/review-park/spot.yaml"),
      stringify(data),
    );
    const sourceFile = join(root, "research", id, "source.md");
    const saved = await readFile(sourceFile, "utf8");
    await writeFile(
      sourceFile,
      saved.replace(
        "## Carl 備註\n無",
        "## Carl 備註\nhttps://example.org/boundaries",
      ),
    );
    assert.equal(
      (await checkResearch(root, ["review-park"])).sources[0]!.notes,
      "fail",
    );
    await writeFile(sourceFile, saved + "\n## Carl 備註\n偽造的重複標題。\n");
    assert.equal((await checkResearch(root, ["review-park"])).ok, false);
    await writeFile(sourceFile, saved);
    await rm(join(root, "research", id, "original.txt"));
    await symlink(input, join(root, "research", id, "original.txt"));
    assert.equal((await checkResearch(root, ["review-park"])).ok, false);
    await rm(join(root, "research", id, "original.txt"));
    await writeFile(
      join(root, "research", id, "original.txt"),
      await readFile(input),
    );
    const formal = structuredClone(data);
    formal.sources[0].url = "https://example.org/different-source";
    await writeFile(
      join(root, "content/spots/approved-park/spot.yaml"),
      stringify(formal),
    );
    assert.equal((await checkResearch(root, ["review-park"])).ok, false);
  } finally {
    await cleanup();
  }
});

test("lost originals only restore the saved content without changing evidence on rejection", async () => {
  const { root, cleanup } = await workspace();
  try {
    const id = await initResearch(
      root,
      "2026-10-15",
      "restore",
      "https://example.org/restore",
    );
    const input = join(root, "supplied.txt");
    const original = "原先保存的虛構完整文章內容。";
    await writeFile(input, original);
    await captureOriginal(root, id, "carl", input);
    const dir = join(root, "research", id);
    const saved = await readFile(join(dir, "source.md"), "utf8");
    await rm(join(dir, "original.txt"));
    await writeFile(input, "網頁改版後的另一份文字。");
    await assert.rejects(
      captureOriginal(root, id, "carl", input),
      /已保存原文/,
    );
    assert.equal(await readFile(join(dir, "source.md"), "utf8"), saved);
    await assert.rejects(readFile(join(dir, "original.txt")), {
      code: "ENOENT",
    });
    await writeFile(
      join(dir, "source.md"),
      saved.replace(/SHA256：[a-f0-9]{64}/, "SHA256：broken"),
    );
    await assert.rejects(
      captureOriginal(root, id, "carl", input),
      /已保存原文/,
    );
    await writeFile(join(dir, "source.md"), saved);
    await writeFile(input, original);
    await captureOriginal(root, id, "carl", input);
    assert.equal(await readFile(join(dir, "original.txt"), "utf8"), original);
  } finally {
    await cleanup();
  }
});

test("private record updates replace complete files and reject symlinks or exclusive overwrites", async () => {
  const { root, cleanup } = await workspace();
  try {
    const path = join(root, "record.md");
    const prior = join(root, "prior.md");
    await writeLocal(path, "保存的決定", true);
    await link(path, prior);
    await writeLocal(path, "完整的新紀錄");
    assert.equal(await readFile(prior, "utf8"), "保存的決定");
    assert.equal(await readFile(path, "utf8"), "完整的新紀錄");
    await assert.rejects(writeLocal(path, "不得覆寫", true));
    await rm(path);
    await symlink(prior, path);
    await assert.rejects(writeLocal(path, "不得跟隨"));
    assert.equal(await readFile(prior, "utf8"), "保存的決定");
  } finally {
    await cleanup();
  }
});
