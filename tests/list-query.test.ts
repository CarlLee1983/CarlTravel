import test from "node:test";
import assert from "node:assert/strict";
import type { ListEntry } from "../src/content/list.ts";
import {
  entryAgeLabels,
  pageSize,
  queryList,
} from "../src/content/list-query.ts";

function entry(id: string, overrides: Partial<ListEntry> = {}): ListEntry {
  return {
    id,
    name: id,
    county: "臺北市",
    district: "中正區",
    kind: "公園",
    setting: "戶外",
    summary: "摘要",
    illustration: null,
    age: null,
    family: {
      stroller: "unknown",
      nursingRoom: "unknown",
      familyToilet: "unknown",
      rainyDay: "unknown",
      accessibility: "unknown",
    },
    checkedAt: "2026-01-01",
    status: null,
    ...overrides,
  };
}

// 62 筆：依序排在臺北市與新北市，名稱可排序
function many(count: number) {
  return Array.from({ length: count }, (_, index) =>
    entry(`s${String(index).padStart(3, "0")}`, {
      name: `景點${String(index).padStart(3, "0")}`,
      county: index < 40 ? "臺北市" : "新北市",
    }),
  );
}

const ids = (rows: readonly ListEntry[]) => rows.map((row) => row.id);

test("每頁 24 筆，範圍與總頁數正確", () => {
  const rows = many(62);
  const first = queryList(rows, {});
  assert.equal(pageSize, 24);
  assert.equal(first.rows.length, 24);
  assert.deepEqual(first.range, { from: 1, to: 24, total: 62 });
  assert.equal(first.totalPages, 3);
  const last = queryList(rows, { page: "3" });
  assert.equal(last.rows.length, 14);
  assert.deepEqual(last.range, { from: 49, to: 62, total: 62 });
  const exact = queryList(many(48), { page: "2" });
  assert.deepEqual(exact.range, { from: 25, to: 48, total: 48 });
  assert.equal(exact.totalPages, 2);
});

test("頁碼超過最後一頁改成最後一頁，並標示網址要修正", () => {
  const result = queryList(many(62), { page: "99" });
  assert.equal(result.conditions.page, 3);
  assert.equal(result.needsUrlReplace, true);
  assert.deepEqual(result.range, { from: 49, to: 62, total: 62 });
  const huge = queryList(many(62), { page: "99999999999999999999" });
  assert.equal(huge.conditions.page, 3);
  assert.equal(huge.needsUrlReplace, true);
});

test("不是正整數的頁碼視為第 1 頁並標示網址要修正", () => {
  for (const page of [
    "0",
    "-1",
    "abc",
    "1.5",
    "2abc",
    " 2",
    "+2",
    "1e1",
    "２",
  ]) {
    const result = queryList(many(62), { page });
    assert.equal(result.conditions.page, 1, page);
    assert.equal(result.needsUrlReplace, true, page);
    assert.equal(result.range.from, 1, page);
  }
  for (const page of [0, -3, 1.5, Number.NaN, Infinity]) {
    const result = queryList(many(62), { page });
    assert.equal(result.conditions.page, 1, String(page));
    assert.equal(result.needsUrlReplace, true, String(page));
  }
});

test("合法頁碼、沒有頁碼與空字串都不需要修正網址", () => {
  const rows = many(62);
  for (const page of [undefined, null, "", "2", "3", 2] as const) {
    const result = queryList(rows, { page });
    assert.equal(result.needsUrlReplace, false, String(page));
  }
  assert.equal(queryList(rows, { page: "2" }).conditions.page, 2);
  assert.equal(queryList(rows, { page: 3 }).conditions.page, 3);
  assert.equal(queryList(rows, {}).conditions.page, 1);
});

test("明寫的 page=1 不是正規網址，要修正成不帶頁碼", () => {
  const result = queryList(many(62), { page: "1" });
  assert.equal(result.conditions.page, 1);
  assert.equal(result.needsUrlReplace, true);
});

test("空結果只有一頁，範圍為 0", () => {
  const result = queryList(many(5), { county: "高雄市" });
  assert.equal(result.conditions.county, "");
  const none = queryList(many(5), { hits: [] });
  assert.deepEqual(none.rows, []);
  assert.deepEqual(none.range, { from: 0, to: 0, total: 0 });
  assert.equal(none.totalPages, 1);
  assert.equal(none.conditions.page, 1);
  const paged = queryList(many(5), { hits: [], page: "4" });
  assert.equal(paged.conditions.page, 1);
  assert.equal(paged.needsUrlReplace, true);
  const empty = queryList([], {});
  assert.deepEqual(empty.range, { from: 0, to: 0, total: 0 });
});

test("縣市、類型、環境、年齡帶與文字命中取交集", () => {
  const rows = [
    entry("a", {
      county: "新北市",
      kind: "博物館",
      setting: "室內",
      age: { min: 3, max: 6 },
    }),
    entry("b", {
      county: "新北市",
      kind: "博物館",
      setting: "室內",
      age: { min: 7, max: 12 },
    }),
    entry("c", {
      county: "新北市",
      kind: "公園",
      setting: "室內",
      age: { min: 3, max: 6 },
    }),
    entry("d", {
      county: "臺北市",
      kind: "博物館",
      setting: "室內",
      age: { min: 3, max: 6 },
    }),
    entry("e", {
      county: "新北市",
      kind: "博物館",
      setting: "戶外",
      age: { min: 3, max: 6 },
    }),
    entry("f", { county: "新北市", kind: "博物館", setting: "室內" }),
  ] as ListEntry[];
  const base = {
    county: "新北市",
    kind: "博物館",
    setting: "室內",
    age: "3–6 歲",
  };
  assert.deepEqual(ids(queryList(rows, base).rows), ["a"]);
  assert.deepEqual(ids(queryList(rows, { ...base, age: "年齡未標示" }).rows), [
    "f",
  ]);
  assert.deepEqual(
    ids(queryList(rows, { county: "新北市", age: "3–6 歲" }).rows).sort(),
    ["a", "c", "e"],
  );
  assert.deepEqual(ids(queryList(rows, { kind: "公園" }).rows), ["c"]);
  assert.deepEqual(ids(queryList(rows, { setting: "戶外" }).rows), ["e"]);
  // 文字命中再與其他四個條件取交集
  assert.deepEqual(ids(queryList(rows, { ...base, hits: ["a", "b"] }).rows), [
    "a",
  ]);
  assert.deepEqual(
    ids(queryList(rows, { ...base, hits: ["b", "c"] }).rows),
    [],
  );
  assert.deepEqual(ids(queryList(rows, { hits: ["b", "d", "zzz"] }).rows), [
    "b",
    "d",
  ]);
});

test("年齡帶用相交判斷，13 歲以上含沒有上限的景點", () => {
  const rows = [
    entry("a", { age: { min: 0, max: 2 } }),
    entry("b", { age: { min: 2, max: 4 } }),
    entry("c", { age: { min: 10, max: null } }),
    entry("d", { age: null }),
  ];
  assert.deepEqual(ids(queryList(rows, { age: "0–2 歲" }).rows), ["a", "b"]);
  assert.deepEqual(ids(queryList(rows, { age: "3–6 歲" }).rows), ["b"]);
  assert.deepEqual(ids(queryList(rows, { age: "7–12 歲" }).rows), ["c"]);
  assert.deepEqual(ids(queryList(rows, { age: "13 歲以上" }).rows), ["c"]);
  assert.deepEqual(ids(queryList(rows, { age: "年齡未標示" }).rows), ["d"]);
  assert.deepEqual(entryAgeLabels(rows[1]!), ["0–2 歲", "3–6 歲"]);
  assert.deepEqual(entryAgeLabels(rows[3]!), ["年齡未標示"]);
});

test("資料裡沒有的條件值被忽略並標示網址要修正，不會變成 0 筆", () => {
  const rows = many(5);
  const result = queryList(rows, {
    county: "不存在市",
    kind: "x",
    setting: "y",
    age: "z",
  });
  assert.deepEqual(result.conditions, {
    county: "",
    kind: "",
    setting: "",
    age: "",
    page: 1,
  });
  assert.equal(result.needsUrlReplace, true);
  assert.equal(result.range.total, 5);
  const valid = queryList(rows, { county: "臺北市" });
  assert.equal(valid.conditions.county, "臺北市");
  assert.equal(valid.needsUrlReplace, false);
});

test("沒有文字時依縣市北到南、同縣市依名稱排列", () => {
  const rows = [
    entry("1", { name: "C", county: "高雄市" }),
    entry("2", { name: "B", county: "新北市" }),
    entry("3", { name: "A", county: "臺北市" }),
    entry("4", { name: "A", county: "新北市" }),
    entry("5", { name: "D", county: "基隆市" }),
    entry("6", { name: "E", county: "金門縣" }),
    entry("7", { name: "F", county: "宜蘭縣" }),
  ];
  assert.deepEqual(ids(queryList(rows, {}).rows), [
    "5",
    "3",
    "4",
    "2",
    "1",
    "7",
    "6",
  ]);
  // 名稱相同時以 id 決定，結果穩定
  const tie = [entry("b", { name: "同名" }), entry("a", { name: "同名" })];
  assert.deepEqual(ids(queryList(tie, {}).rows), ["a", "b"]);
});

test("有文字時依命中的相關度排序，並跨頁保持順序", () => {
  const rows = many(62);
  const hits = ["s061", "s000", "s030", "s045"];
  assert.deepEqual(ids(queryList(rows, { hits }).rows), hits);
  const wide = Array.from(
    { length: 30 },
    (_, index) => `s${String(59 - index).padStart(3, "0")}`,
  );
  const second = queryList(rows, { hits: wide, page: "2" });
  assert.deepEqual(ids(second.rows), wide.slice(24));
  assert.deepEqual(second.range, { from: 25, to: 30, total: 30 });
  // 重複的命中以第一次出現為準
  assert.deepEqual(
    ids(queryList(rows, { hits: ["s002", "s001", "s002"] }).rows),
    ["s002", "s001"],
  );
});

test("hits 為 null 或未提供時不做文字篩選，空陣列表示沒有命中", () => {
  const rows = many(30);
  assert.equal(queryList(rows, { hits: null }).range.total, 30);
  assert.equal(queryList(rows, {}).range.total, 30);
  assert.equal(queryList(rows, { hits: [] }).range.total, 0);
});

test("不改動輸入資料與輸入的 hits", () => {
  const rows = many(30);
  const snapshot = ids(rows);
  const hits = ["s003", "s001"];
  queryList(rows, { hits, county: "臺北市", page: "2" });
  assert.deepEqual(ids(rows), snapshot);
  assert.deepEqual(hits, ["s003", "s001"]);
});
