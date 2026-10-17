import test from "node:test";
import assert from "node:assert/strict";
import { loadSpots } from "../src/content/load.ts";
import type { Spot } from "../src/content/schema.ts";
import {
  checklistView,
  contactRef,
  mapMode,
  preDepartureRows,
  sectionEntries,
} from "../src/content/spot-page.ts";

const spots = await loadSpots("tests/fixtures/spots");
const museum = spots.find((spot) => spot.id === "example-museum")!;
const park = spots.find((spot) => spot.id === "example-park")!;

// 全未知、沒有費用列的景點：手寫的公園，與 e2e 看到的相同
const allUnknown = park;

test("沒有結構化營運狀態時，營運狀態列寫未記錄異動且不強調", () => {
  const [status] = preDepartureRows(allUnknown, null);
  assert.deepEqual(status, {
    label: "營運狀態",
    value: "未記錄異動，出發前請看官方公告",
    to: "references",
    strong: false,
  });
});

test("有結構化營運狀態時，營運狀態列顯示該狀態並深色強調", () => {
  const [status] = preDepartureRows(allUnknown, {
    text: "休園中",
    closed: true,
  });
  assert.equal(status?.value, "休園中");
  assert.equal(status?.strong, true);
});

test("全未知且沒有費用列的景點：費用、親子條件、年齡都不寫成沒有", () => {
  const rows = preDepartureRows(allUnknown, null);
  assert.deepEqual(
    rows.map((row) => [row.label, row.value, row.to]),
    [
      ["營運狀態", "未記錄異動，出發前請看官方公告", "references"],
      ["開放時間", "每日上午九點至下午五點。", "hours"],
      ["費用", "尚未整理，未列出不代表免費", "hours"],
      ["親子條件", "尚未整理（未知不代表沒有）", "checklist"],
      ["建議年齡", "未標示", "checklist"],
    ],
  );
});

test("有衝突時多一列資訊衝突，位置在費用之後並強調，連到第一個衝突章節", () => {
  const rows = preDepartureRows(museum, null);
  assert.deepEqual(
    rows.map((row) => row.label),
    ["營運狀態", "開放時間", "費用", "資訊衝突", "親子條件", "建議年齡"],
  );
  const conflict = rows.find((row) => row.label === "資訊衝突")!;
  assert.equal(conflict.strong, true);
  assert.equal(conflict.to, "hours");
  assert.match(conflict.value, /門票/);
  assert.equal(
    rows.find((row) => row.label === "費用")?.value,
    "官方資訊有衝突",
  );
  assert.equal(
    rows.find((row) => row.label === "親子條件")?.value,
    "已知 3／5 項",
  );
  assert.match(rows.find((row) => row.label === "建議年齡")!.value, /歲/);
});

test("休園時地圖降級為文字連結，其餘維持按鈕", () => {
  assert.equal(mapMode(null), "buttons");
  assert.equal(mapMode({ text: "休園中", closed: true }), "quiet");
  assert.equal(mapMode({ text: "部分關閉", closed: false }), "buttons");
});

test("親子清單只列已知項目，未知收成一組並附確認機關", () => {
  const view = checklistView(museum);
  assert.deepEqual(
    view.known.map((entry) => [entry.label, entry.item.status]),
    [
      ["推車友善", "yes"],
      ["哺乳室", "no"],
      ["雨天備案", "yes"],
    ],
  );
  assert.deepEqual(
    view.unknown.map((entry) => entry.label),
    ["親子廁所", "無障礙設施"],
  );
  assert.equal(view.contact?.organization, "範例探索館");
  assert.equal(checklistView(allUnknown).known.length, 0);
});

test("章節依固定順序，資料沒有的官方章節標為尚未整理而不是省略", () => {
  const entries = sectionEntries(allUnknown, "交通與停車");
  assert.deepEqual(
    entries.map((entry) => [entry.id, entry.missing]),
    [
      ["checklist", false],
      ["hours", false],
      ["transport", false],
      ["facilities", true],
      ["with-kids", true],
      ["references", false],
    ],
  );
  const full = sectionEntries(museum, "交通與停車");
  assert.deepEqual(
    full.map((entry) => entry.id),
    [
      "checklist",
      "hours",
      "transport",
      "facilities",
      "with-kids",
      "author",
      "tips",
      "nearby",
      "references",
    ],
  );
});

test("章節提要：已知項目數、衝突與費用缺漏", () => {
  const gist = (spot: Spot, id: string) =>
    sectionEntries(spot, "交通與停車").find((entry) => entry.id === id)?.gist;
  assert.equal(gist(museum, "checklist"), "已知 3／5 項");
  assert.equal(gist(allUnknown, "checklist"), "尚未整理");
  assert.equal(gist(museum, "hours"), "有衝突");
  assert.equal(gist(allUnknown, "hours"), "費用尚未整理");
  assert.equal(gist(allUnknown, "references"), "1 筆");
});

test("確認機關取第一個官方頁面出處，沒有頁面出處時退回第一筆", () => {
  assert.equal(contactRef(park)?.organization, "範例管理處");
  assert.equal(contactRef({ ...park, officialRefs: [] }), undefined);
});
