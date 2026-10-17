import type { Page } from "@playwright/test";

import {
  FIXTURE_COUNT,
  FIXTURE_SEED,
  describeSpots,
} from "../scripts/scale/generate-spots.ts";

// e2e fixture = tests/fixtures/spots 手寫 2 筆（其中 example-park 為戶外）+ 固定種子產生的 FIXTURE_COUNT 筆，
// 總數與戶外數都由產生器推導，不必手動同步。
const HANDWRITTEN_SPOTS = 2;
const HANDWRITTEN_OUTDOOR_SPOTS = 1;
const generated = describeSpots({ seed: FIXTURE_SEED, count: FIXTURE_COUNT });
export const TOTAL_SPOTS = HANDWRITTEN_SPOTS + generated.length;
export const PAGE_SIZE = 24;
// 環境「戶外」的筆數（超過一頁），用來測帶條件的分頁
export const OUTDOOR_SPOTS =
  HANDWRITTEN_OUTDOOR_SPOTS +
  generated.filter(({ spot }) => spot.setting === "戶外").length;
// 範圍文字是唯一的筆數播報處，例如「第 25–48 筆，共 62 筆」
export const RANGE_RESULT = /^第 [\d,]+(–[\d,]+)? 筆，共 [\d,]+ 筆$/;
export const range = (from: number, to: number, total: number) =>
  from === to
    ? `第 ${from} 筆，共 ${total} 筆`
    : `第 ${from}–${to} 筆，共 ${total} 筆`;

export const rangeText = (page: Page) => page.getByRole("status");
export const spotCards = (page: Page) => page.locator(".results .spots > li");

// 攔住符合的請求，等測試放行；requested 在第一個請求到達時解除。
// 用來把「請求還沒回來」的中間狀態固定住，而不是靠時間碰運氣。
export function hold(page: Page, pattern: string) {
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const requested = new Promise<void>((resolve) => (started = resolve));
  void page.route(pattern, async (route) => {
    started();
    await held;
    await route.continue();
  });
  return { requested, release };
}
