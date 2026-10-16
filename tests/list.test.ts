import test from "node:test";
import assert from "node:assert/strict";
import { loadSpots } from "../src/content/load.ts";
import { compareListOrder } from "../src/content/list-order.ts";
import { decodeList, encodeList, listFields } from "../src/content/list.ts";

test("列表 JSON 編碼後可無損解碼，欄位與筆數符合規格", async () => {
  const spots = await loadSpots("tests/fixtures/spots");
  const data = JSON.parse(JSON.stringify(encodeList(spots)));
  assert.deepEqual(data.fields, listFields);
  assert.equal(data.rows.length, spots.length);
  const entries = decodeList(data);
  assert.deepEqual(
    entries.map((entry) => entry.id),
    [...spots].sort(compareListOrder).map((spot) => spot.id),
  );
  for (const entry of entries) {
    const spot = spots.find((item) => item.id === entry.id)!;
    assert.equal(entry.name, spot.name);
    assert.equal(entry.county, spot.county);
    assert.equal(entry.district, spot.district);
    assert.equal(entry.kind, spot.kind);
    assert.equal(entry.setting, spot.setting);
    assert.ok([...entry.summary].length <= 30);
    assert.equal(entry.summary, spot.summary);
    assert.equal(entry.checkedAt, spot.familyChecklist.checkedAt);
    assert.equal(entry.status, null);
    assert.equal(
      entry.illustration?.hash,
      spot.illustration?.sha256.slice(0, 16),
    );
    assert.equal(entry.illustration?.alt, spot.illustration?.alt);
    assert.equal(
      entry.age?.min,
      spot.ageRange.status === "known" ? spot.ageRange.min : undefined,
    );
    for (const [key, state] of Object.entries(entry.family))
      assert.equal(
        state,
        spot.familyChecklist[key as keyof typeof entry.family].status,
      );
  }
});

test("五項親子條件壓成 5 位數字字串，0 未知、1 有、2 無", async () => {
  const [spot] = await loadSpots("tests/fixtures/spots");
  const checklist = spot!.familyChecklist;
  const ref = "官方出處";
  const custom = {
    ...spot!,
    familyChecklist: {
      ...checklist,
      stroller: { status: "yes" as const, ref },
      nursingRoom: { status: "no" as const, ref },
      familyToilet: { status: "unknown" as const },
      rainyDay: { status: "no" as const, ref },
      accessibility: { status: "yes" as const, ref },
    },
  };
  const row = encodeList([custom]).rows[0]!;
  assert.equal(row[listFields.indexOf("family")], "12021");
  assert.deepEqual(decodeList(encodeList([custom]))[0]!.family, {
    stroller: "yes",
    nursingRoom: "no",
    familyToilet: "unknown",
    rainyDay: "no",
    accessibility: "yes",
  });
});

test("未知年齡與缺少插畫解碼為 null，已知年齡可缺上限", async () => {
  const spots = await loadSpots("tests/fixtures/spots");
  const base = spots[0]!;
  const open = {
    ...base,
    ageRange: { status: "known" as const, min: 3, ref: "x" },
  };
  const none = {
    ...base,
    ageRange: { status: "unknown" as const },
    illustration: undefined,
  };
  const [a, b] = decodeList(encodeList([open, { ...none, id: "zzz" }]));
  assert.deepEqual(a!.age, { min: 3, max: null });
  assert.equal(b!.age, null);
  assert.equal(b!.illustration, null);
});

test("表頭或列長度不符時拒絕解碼", () => {
  assert.throws(() => decodeList({ fields: ["id"], rows: [] }), /表頭/);
  assert.throws(
    () => decodeList({ fields: listFields, rows: [["only-id"]] }),
    /長度/,
  );
});

test("列表 JSON 的 rows 已是列表順序，與靜態分頁逐頁串起來的順序一致", async () => {
  const { queryList, pageSize } = await import("../src/content/list-query.ts");
  const base = (await loadSpots("tests/fixtures/spots"))[0]!;
  // 縣市橫跨北到南、名稱不依 id 順序，id 順序與列表順序刻意相反
  const spots = Array.from({ length: pageSize * 2 + 5 }, (_, index) => ({
    ...base,
    id: `s${String(100 - index).padStart(3, "0")}`,
    name: `景點${String.fromCharCode(0x4e00 + ((index * 7) % 23))}`,
    county: (["高雄市", "臺北市", "臺南市"] as const)[index % 3]!,
  }));
  const entries = decodeList(JSON.parse(JSON.stringify(encodeList(spots))));
  assert.deepEqual(
    entries.map((entry) => entry.id),
    [...entries].sort(compareListOrder).map((entry) => entry.id),
  );
  const pages = Math.ceil(entries.length / pageSize);
  const paged = Array.from(
    { length: pages },
    (_, index) => queryList(entries, { page: String(index + 1) }).rows,
  ).flat();
  assert.deepEqual(
    paged.map((entry) => entry.id),
    entries.map((entry) => entry.id),
  );
  // 北到南：第一筆是臺北市
  assert.equal(entries[0]!.county, "臺北市");
});
