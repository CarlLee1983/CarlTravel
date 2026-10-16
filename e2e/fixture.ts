import type { Page } from "@playwright/test";

// e2e fixture 的景點總數：手寫 2 筆 + scripts/scale/generate-spots.ts 的 FIXTURE_COUNT 筆。
// 改動產生器的筆數時要同步這裡；tests/scale-generator.test.ts 固定產生器那一側。
export const TOTAL_SPOTS = 62;
export const PAGE_SIZE = 24;
// 環境「戶外」在 fixture 裡有 39 筆（兩頁），用來測帶條件的分頁
export const OUTDOOR_SPOTS = 39;
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
