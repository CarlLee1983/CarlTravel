import test from "node:test";
import assert from "node:assert/strict";
import { ageBands, normalizeSearchText } from "../src/content/search.ts";

test("age filters distinguish unknown and include every overlapping band", () => {
  assert.deepEqual(ageBands({ status: "unknown" }), ["年齡未標示"]);
  assert.deepEqual(
    ageBands({ status: "known", min: 2, max: 3, ref: "office" }),
    ["0–2 歲", "3–6 歲"],
  );
  assert.deepEqual(
    ageBands({ status: "known", min: 6, max: 7, ref: "office" }),
    ["3–6 歲", "7–12 歲"],
  );
  assert.deepEqual(
    ageBands({ status: "known", min: 12, max: 13, ref: "office" }),
    ["7–12 歲", "13 歲以上"],
  );
  assert.deepEqual(
    ageBands({ status: "known", min: 0, max: 0, ref: "office" }),
    ["0–2 歲"],
  );
  assert.deepEqual(ageBands({ status: "known", min: 3, ref: "office" }), [
    "3–6 歲",
    "7–12 歲",
    "13 歲以上",
  ]);
  assert.deepEqual(ageBands({ status: "known", min: 13, ref: "office" }), [
    "13 歲以上",
  ]);
});

test("台與臺視為同一字：兩種寫法正規化成同一個字串", () => {
  assert.equal(normalizeSearchText("臺北"), "台北");
  assert.equal(normalizeSearchText("台北"), "台北");
  assert.equal(normalizeSearchText("臺北台中臺南"), "台北台中台南");
  // 其他異體字與一般文字不動
  assert.equal(normalizeSearchText("公園 park 體"), "公園 park 體");
  assert.equal(
    normalizeSearchText(normalizeSearchText("臺")),
    normalizeSearchText("臺"),
  );
});
