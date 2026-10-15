import test from "node:test";
import assert from "node:assert/strict";
import { overlap } from "../scripts/research/overlap.ts";

test("overlap blocks twelve Unicode characters after typography normalization, not eleven", () => {
  assert.equal(
    overlap("甲乙丙丁戊己庚辛壬癸子", "甲乙丙丁戊己庚辛壬癸子"),
    null,
  );
  assert.equal(
    overlap("開頭甲乙丙丁戊己庚辛壬癸子丑末尾", "甲乙丙丁，戊己庚辛\n壬癸子丑"),
    "甲乙丙丁戊己庚辛壬癸子丑",
  );
  assert.equal(
    overlap("ＡＢＣＤＥＦＧＨＩＪＫＬ", "ABCDEFGHIJKL"),
    "ABCDEFGHIJKL",
  );
  assert.equal(
    overlap("甲乙丙丁戊己庚辛壬癸子😀", "甲乙丙丁戊己庚辛壬癸子😀"),
    "甲乙丙丁戊己庚辛壬癸子😀",
  );
});
