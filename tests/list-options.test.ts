import test from "node:test";
import assert from "node:assert/strict";
import type { ListEntry } from "../src/content/list.ts";
import {
  filterKeys,
  filterOptions,
  queryList,
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

// 縣市、行政區、類型、環境、年齡各有差異的小資料集
const rows = [
  entry("a", {
    county: "臺北市",
    district: "中正區",
    kind: "公園",
    age: { min: 0, max: 2 },
  }),
  entry("b", {
    county: "臺北市",
    district: "大安區",
    kind: "博物館",
    setting: "室內",
    age: { min: 3, max: 6 },
  }),
  entry("c", {
    county: "臺北市",
    district: "大安區",
    kind: "公園",
    age: { min: 3, max: 12 },
  }),
  entry("d", {
    county: "基隆市",
    district: "中正區",
    kind: "公園",
    setting: "室內",
  }),
  entry("e", {
    county: "新北市",
    district: "板橋區",
    kind: "博物館",
    setting: "室內",
  }),
  entry("f", {
    county: "新北市",
    district: "板橋區",
    kind: "公園",
    age: { min: 13, max: null },
  }),
];

const counts = (view: ReturnType<typeof filterOptions>, key: FilterKey) =>
  Object.fromEntries(view[key].options.map((o) => [o.value, o.count]));

test("行政區必須屬於已選縣市：只有行政區、或與縣市不符時忽略並要求修正網址", () => {
  const alone = queryList(rows, { district: "中正區" });
  assert.equal(alone.conditions.district, "");
  assert.equal(alone.needsUrlReplace, true);
  assert.equal(alone.range.total, 6);

  const mismatch = queryList(rows, { county: "新北市", district: "中正區" });
  assert.equal(mismatch.conditions.county, "新北市");
  assert.equal(mismatch.conditions.district, "");
  assert.equal(mismatch.needsUrlReplace, true);
  assert.equal(mismatch.range.total, 2);

  const unknown = queryList(rows, { county: "臺北市", district: "不存在區" });
  assert.equal(unknown.conditions.district, "");
  assert.equal(unknown.needsUrlReplace, true);

  // 縣市本身無效時，行政區一併捨棄
  const badCounty = queryList(rows, { county: "高雄市", district: "中正區" });
  assert.deepEqual(
    [badCounty.conditions.county, badCounty.conditions.district],
    ["", ""],
  );
  assert.equal(badCounty.range.total, 6);
});

test("同名行政區只在所屬縣市內篩選", () => {
  const taipei = queryList(rows, { county: "臺北市", district: "中正區" });
  assert.deepEqual(taipei.conditions.district, "中正區");
  assert.equal(taipei.needsUrlReplace, false);
  assert.deepEqual(
    taipei.rows.map((r) => r.id),
    ["a"],
  );
  const keelung = queryList(rows, { county: "基隆市", district: "中正區" });
  assert.deepEqual(
    keelung.rows.map((r) => r.id),
    ["d"],
  );
});

test("filterOptions：行政區只在選了縣市後出現，只列該縣市有景點的行政區", () => {
  const none = filterOptions(rows, {});
  assert.equal(none.district.visible, false);
  assert.deepEqual(none.district.options, []);
  const taipei = filterOptions(rows, { county: "臺北市" });
  assert.equal(taipei.district.visible, true);
  assert.deepEqual(counts(taipei, "district"), { 中正區: 1, 大安區: 2 });
  // 只有一個行政區：沒有區分作用，隱藏
  const newTaipei = filterOptions(rows, { county: "新北市" });
  assert.equal(newTaipei.district.visible, false);
  // 不屬於縣市的行政區被忽略
  const mismatch = filterOptions(rows, {
    county: "新北市",
    district: "中正區",
  });
  assert.equal(mismatch.district.selected, "");
});

test("選後筆數納入其他條件，但不納入自己這個維度的已選值", () => {
  const view = filterOptions(rows, { county: "臺北市", kind: "公園" });
  // 縣市維度：以「類型 = 公園」計算，各縣市的公園數
  assert.deepEqual(counts(view, "county"), { 臺北市: 2, 基隆市: 1, 新北市: 1 });
  // 類型維度：以「縣市 = 臺北市」計算
  assert.deepEqual(counts(view, "kind"), { 公園: 2, 博物館: 1 });
  assert.equal(view.kind.total, 3);
  assert.equal(view.county.total, 4);
});

test("已選行政區時，其他縣市的筆數不受行政區限制（改縣市會清掉行政區）", () => {
  const view = filterOptions(rows, { county: "臺北市", district: "大安區" });
  // 已選的縣市沿用行政區條件；其他縣市以清掉行政區後計算
  assert.deepEqual(counts(view, "county"), { 臺北市: 2, 基隆市: 1, 新北市: 2 });
  assert.equal(
    view.county.options.every((o) => !o.disabled),
    true,
  );
  assert.deepEqual(counts(view, "district"), { 中正區: 1, 大安區: 2 });
  assert.equal(view.district.selected, "大安區");
});

test("選後筆數納入文字命中", () => {
  const view = filterOptions(rows, { hits: ["a", "b", "e", "zzz"] });
  assert.deepEqual(counts(view, "county"), { 臺北市: 2, 基隆市: 0, 新北市: 1 });
  assert.deepEqual(counts(view, "kind"), { 公園: 1, 博物館: 2 });
  const empty = filterOptions(rows, { hits: [] });
  assert.deepEqual(counts(empty, "county"), {
    臺北市: 0,
    基隆市: 0,
    新北市: 0,
  });
  const none = filterOptions(rows, { hits: null });
  assert.equal(none.county.total, 6);
});

test("年齡帶可同時計入多個年齡帶，年齡未標示不是選項", () => {
  const view = filterOptions(rows, {});
  assert.deepEqual(counts(view, "age"), {
    "0–2 歲": 1,
    "3–6 歲": 2,
    "7–12 歲": 1,
    "13 歲以上": 1,
  });
});

test("0 筆的選項停用，目前已選的選項即使 0 筆也不停用", () => {
  const view = filterOptions(rows, { county: "新北市", kind: "公園" });
  const age = view.age.options;
  assert.equal(age.find((o) => o.value === "3–6 歲")!.count, 0);
  assert.equal(age.find((o) => o.value === "3–6 歲")!.disabled, true);
  assert.equal(age.find((o) => o.value === "13 歲以上")!.disabled, false);
  // 文字命中讓已選的縣市變成 0 筆：仍可操作，其他 0 筆的縣市停用
  const selected = filterOptions(rows, { county: "新北市", hits: ["a", "b"] });
  const byCounty = Object.fromEntries(
    selected.county.options.map((o) => [o.value, o]),
  );
  assert.equal(byCounty["新北市"]!.count, 0);
  assert.equal(byCounty["新北市"]!.disabled, false);
  assert.equal(byCounty["基隆市"]!.disabled, true);
  assert.equal(byCounty["臺北市"]!.disabled, false);
  assert.equal(selected.county.selected, "新北市");
});

test("無法區分的維度隱藏：只有一個選項、或每個選項結果都相同", () => {
  const unknownAges = [entry("x"), entry("y", { kind: "博物館" })];
  const only = filterOptions(unknownAges, {});
  assert.equal(only.age.visible, false);
  assert.equal(only.county.visible, false);
  assert.equal(only.setting.visible, false);
  assert.equal(only.kind.visible, true);
  // 每筆都涵蓋所有年齡帶：每個選項都得到同一組
  const everyBand = [
    entry("p", { age: { min: 0, max: null } }),
    entry("q", { age: { min: 0, max: null } }),
  ];
  const same = filterOptions(everyBand, {});
  assert.deepEqual(Object.values(counts(same, "age")), [2, 2, 2, 2]);
  assert.equal(same.age.visible, false);
  // 一個選項涵蓋全部、其餘為 0：選了也不會改變結果
  const oneSided = filterOptions([entry("m"), entry("n")], {});
  assert.equal(oneSided.kind.visible, false);
  assert.equal(filterOptions([], {}).kind.visible, false);
});

test("隱藏只看整份資料能否區分，不隨篩選條件或文字命中改變", () => {
  // 縮到只剩一組結果時，維度仍照整份資料顯示（選項筆數會變 0 並停用）
  const narrowed = filterOptions(rows, { county: "新北市", hits: ["e"] });
  assert.equal(narrowed.kind.visible, true);
  assert.equal(narrowed.setting.visible, true);
  assert.equal(narrowed.age.visible, true);
  assert.equal(narrowed.county.visible, true);
  const empty = filterOptions(rows, { hits: [] });
  assert.equal(empty.county.visible, true);
  assert.equal(empty.kind.visible, true);
  // 已選的維度即使資料無法區分也不隱藏，使用者才能取消
  const single = [entry("x"), entry("y")];
  assert.equal(filterOptions(single, {}).kind.visible, false);
  assert.equal(filterOptions(single, { kind: "公園" }).kind.visible, true);
  // 行政區看已選縣市自己的行政區
  const split = [
    entry("p", { county: "臺北市", district: "大安區" }),
    entry("q", { county: "臺北市", district: "中正區" }),
    entry("r", { county: "新北市", district: "板橋區" }),
  ];
  assert.equal(
    filterOptions(split, { county: "臺北市" }).district.visible,
    true,
  );
  assert.equal(
    filterOptions(split, { county: "新北市" }).district.visible,
    false,
  );
});

test("選項順序：縣市北到南、年齡帶由小到大、其餘依名稱穩定排序", () => {
  const view = filterOptions(rows, {});
  assert.deepEqual(
    view.county.options.map((o) => o.value),
    ["基隆市", "臺北市", "新北市"],
  );
  assert.deepEqual(
    view.age.options.map((o) => o.value),
    ["0–2 歲", "3–6 歲", "7–12 歲", "13 歲以上"],
  );
  assert.deepEqual(
    filterOptions(rows, {}).kind.options.map((o) => o.value),
    filterOptions([...rows].reverse(), {}).kind.options.map((o) => o.value),
  );
});

test("每個選項的筆數等於選了它之後 queryList 的總筆數（交叉驗證）", () => {
  const conditionSets: Partial<Record<FilterKey, string>>[] = [
    {},
    { county: "臺北市" },
    { county: "臺北市", district: "大安區" },
    { kind: "公園" },
    { county: "新北市", setting: "室內" },
    { age: "3–6 歲" },
  ];
  for (const hits of [null, ["a", "c", "d", "f"], []]) {
    for (const chosen of conditionSets) {
      const view = filterOptions(rows, { ...chosen, hits });
      for (const key of filterKeys) {
        for (const option of view[key].options) {
          // 選了這個選項、其他條件不變（行政區在縣市改變時依規則清空，此處縣市不變）
          // 改縣市會清掉行政區
          const clearsDistrict =
            key === "county" && option.value !== (chosen.county ?? "");
          const expected = queryList(rows, {
            ...chosen,
            ...(clearsDistrict ? { district: "" } : {}),
            [key]: option.value,
            hits,
          });
          assert.equal(
            expected.conditions[key],
            option.value,
            `${key}=${option.value} 應是有效選項`,
          );
          assert.equal(
            option.count,
            expected.range.total,
            `${JSON.stringify(chosen)} hits=${JSON.stringify(hits)} ${key}=${option.value}`,
          );
        }
      }
    }
  }
});

test("不改動輸入資料，也不依賴輸入順序", () => {
  const snapshot = JSON.stringify(rows);
  const hits = ["b", "a"];
  filterOptions(rows, { county: "臺北市", hits });
  assert.equal(JSON.stringify(rows), snapshot);
  assert.deepEqual(hits, ["b", "a"]);
});
