import test from "node:test";
import assert from "node:assert/strict";
import { cardView } from "../src/content/list-card.ts";
import type { ListEntry } from "../src/content/list.ts";

const base: ListEntry = {
  id: "demo",
  name: "範例景點",
  county: "新北市",
  district: "板橋區",
  kind: "公園",
  setting: "戶外",
  summary: "一句話摘要。",
  illustration: null,
  age: null,
  family: {
    stroller: "unknown",
    nursingRoom: "unknown",
    familyToilet: "unknown",
    rainyDay: "unknown",
    accessibility: "unknown",
  },
  checkedAt: "2026-05-01",
  status: null,
};

test("全部未知：只有一行固定文案，沒有標籤與查證日期", () => {
  const view = cardView(base);
  assert.equal(view.href, "/spots/demo/");
  assert.equal(view.meta, "新北市 板橋區 · 公園 · 戶外");
  assert.deepEqual(view.tags, []);
  assert.equal(view.note, "親子條件與年齡尚未整理，未知不代表沒有");
  assert.equal(view.thumbnail, null);
  assert.equal(view.status, null);
});

test("部分已知：只列已知條件，未知收成一行並附查證日期", () => {
  const view = cardView({
    ...base,
    family: { ...base.family, stroller: "yes", rainyDay: "no" },
  });
  assert.deepEqual(view.tags, [
    { text: "推車友善：有", negative: false },
    { text: "雨天備案：沒有", negative: true },
  ]);
  assert.equal(
    view.note,
    "另有 3 項親子條件未知、年齡未標示 · 查證 2026-05-01",
  );
});

test("年齡已知時成為標籤，未知行不再提年齡", () => {
  const view = cardView({
    ...base,
    age: { min: 3, max: 6 },
    family: { ...base.family, stroller: "yes" },
  });
  assert.equal(view.tags[0]?.text, "3–6 歲");
  assert.equal(view.note, "另有 4 項親子條件未知 · 查證 2026-05-01");
  assert.equal(
    cardView({ ...base, age: { min: 13, max: null } }).tags[0]?.text,
    "13 歲以上",
  );
});

test("只有年齡已知時，仍說明親子條件未知而非整張尚未整理", () => {
  const view = cardView({ ...base, age: { min: 0, max: 2 } });
  assert.equal(view.note, "另有 5 項親子條件未知 · 查證 2026-05-01");
});

test("資訊完整：五項標籤皆列出，否定的為外框，附查證日期", () => {
  const view = cardView({
    ...base,
    age: { min: 3, max: 12 },
    family: {
      stroller: "yes",
      nursingRoom: "yes",
      familyToilet: "no",
      rainyDay: "yes",
      accessibility: "yes",
    },
    illustration: { hash: "abcdef0123456789", alt: "插畫描述" },
  });
  assert.equal(view.tags.length, 6);
  assert.deepEqual(
    view.tags.filter((tag) => tag.negative).map((tag) => tag.text),
    ["親子廁所：沒有"],
  );
  assert.equal(view.note, "親子條件查證 2026-05-01");
  assert.equal(view.thumbnail?.alt, "插畫描述");
  assert.match(view.thumbnail!.src, /demo\.webp\?v=.*-abcdef0123456789$/);
});

test("結構化營運狀態存在時才帶出狀態標籤", () => {
  assert.equal(cardView(base).status, null);
  assert.equal(
    cardView({ ...base, status: "休園中" as unknown as null }).status,
    "休園中",
  );
});
