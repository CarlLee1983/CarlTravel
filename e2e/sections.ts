import type { Page } from "@playwright/test";

// 景點頁章節預設收合（只有親子清單展開）：斷言章節內容前先用真實點擊展開。
export async function openAllSections(page: Page) {
  const closed = page.locator("details:not([open]) > summary");
  while ((await closed.count()) > 0) await closed.first().click();
}
