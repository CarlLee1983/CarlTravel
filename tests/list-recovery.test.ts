import test from "node:test";
import assert from "node:assert/strict";
import type { ListEntry } from "../src/content/list.ts";
import {
  ageUnknownCount,
  filterKeys,
  queryList,
  removalOptions,
  type FilterKey,
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

// 年齡已標示與未標示混合；中正區同時出現在臺北市與基隆市
const rows = [
  entry("a", { age: { min: 0, max: 2 } }),
  entry("b", { district: "大安區", kind: "博物館", age: { min: 3, max: 6 } }),
  entry("c", { district: "大安區", age: null }),
  entry("d", { county: "基隆市", setting: "室內", age: null }),
  entry("e", {
    county: "新北市",
    district: "板橋區",
    kind: "博物館",
    setting: "室內",
    age: { min: 3, max: 12 },
  }),
  entry("f", { county: "新北市", district: "板橋區", age: null }),
];

test("沒有選年齡帶時，年齡未標示的筆數為 0（不需要說明）", () => {
  assert.equal(ageUnknownCount(rows, {}), 0);
  assert.equal(ageUnknownCount(rows, { county: "新北市" }), 0);
});

test("選了年齡帶時，年齡未標示的筆數納入其他條件與文字命中，不受年齡本身影響", () => {
  assert.equal(ageUnknownCount(rows, { age: "3–6 歲" }), 3);
  assert.equal(ageUnknownCount(rows, { age: "0–2 歲" }), 3);
  assert.equal(ageUnknownCount(rows, { age: "3–6 歲", county: "新北市" }), 1);
  assert.equal(
    ageUnknownCount(rows, {
      age: "3–6 歲",
      county: "臺北市",
      district: "大安區",
    }),
    1,
  );
  assert.equal(
    ageUnknownCount(rows, { age: "3–6 歲", hits: ["a", "c", "d"] }),
    2,
  );
  // 年齡值無效就等於沒選
  assert.equal(ageUnknownCount(rows, { age: "年齡未標示" }), 0);
});

test("年齡未標示的筆數 + 列出的筆數 + 年齡不符的筆數 = 拿掉年齡後的總筆數", () => {
  const withAge = queryList(rows, { age: "7–12 歲" }).range.total;
  const without = queryList(rows, {}).range.total;
  const unknown = ageUnknownCount(rows, { age: "7–12 歲" });
  assert.equal(withAge, 1);
  assert.ok(withAge + unknown <= without);
  assert.equal(without - withAge - unknown, 2);
});

test("無結果的移除選項：逐項列出，筆數等於拿掉該項後 queryList 的總筆數", () => {
  const input = {
    county: "臺北市",
    district: "大安區",
    kind: "博物館",
    setting: "室內",
    age: "7–12 歲",
    hits: ["b", "e"],
  };
  assert.equal(queryList(rows, input).range.total, 0);
  const options = removalOptions(rows, { ...input, query: "展" });
  assert.deepEqual(
    options.map((option) => option.key),
    ["query", "county", "district", "kind", "setting", "age"],
  );
  for (const option of options) {
    const rest: Partial<Record<FilterKey, string>> = {};
    for (const key of filterKeys)
      if (!option.cleared.includes(key)) rest[key] = input[key];
    const expected = queryList(rows, {
      ...rest,
      hits: option.key === "query" ? null : input.hits,
    }).range.total;
    assert.equal(option.count, expected, option.key);
  }
  const byKey = Object.fromEntries(options.map((o) => [o.key, o]));
  // 拿掉縣市時行政區一併清掉；其餘只清自己
  assert.deepEqual(byKey.county!.cleared, ["county", "district"]);
  assert.deepEqual(byKey.district!.cleared, ["district"]);
  assert.deepEqual(byKey.query!.cleared, ["query"]);
  assert.equal(byKey.query!.value, "展");
  assert.equal(byKey.kind!.value, "博物館");
});

test("拿掉文字查詢只留篩選條件的筆數；沒有文字命中資料時不列文字項", () => {
  const input = { county: "新北市", hits: [] as string[] };
  const withText = removalOptions(rows, { ...input, query: "zzz" });
  assert.equal(withText[0]!.key, "query");
  assert.equal(withText[0]!.count, 2);
  assert.equal(withText[1]!.key, "county");
  assert.equal(withText[1]!.count, 0);
  // 搜尋失敗（hits 為 null）時文字不是有效條件，不列「移除搜尋」
  const failed = removalOptions(rows, {
    county: "新北市",
    query: "zzz",
    hits: null,
  });
  assert.deepEqual(
    failed.map((option) => option.key),
    ["county"],
  );
});

test("沒有任何條件時沒有移除選項；無效的條件值不列出", () => {
  assert.deepEqual(removalOptions(rows, {}), []);
  assert.deepEqual(
    removalOptions(rows, { age: "年齡未標示", kind: "不存在" }),
    [],
  );
  // 行政區與縣市不符時被忽略，不列出
  const mismatch = removalOptions(rows, {
    county: "新北市",
    district: "中正區",
  });
  assert.deepEqual(
    mismatch.map((option) => option.key),
    ["county"],
  );
});
