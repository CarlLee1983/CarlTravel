import { test, expect } from "@playwright/test";

test("@smoke home links to stable spot route with readable facts and citations", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("開發展示 · 虛構景點與出處，僅供測試，不能作為出遊資訊。"),
  ).toBeVisible();
  await expect(page.getByText("臺北市 中正區 · 公園 · 戶外")).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: /景點列表/ })
      .locator("li[data-spot-url]")
      .filter({ hasText: "範例親子公園" })
      .getByText("親子條件與年齡尚未整理，未知不代表沒有"),
  ).toBeVisible();
  await expect(page.getByText("沿著步道觀察樹木與季節變化。")).toBeVisible();
  await page.getByRole("link", { name: "範例親子公園", exact: true }).click();
  await expect(page).toHaveURL(/\/spots\/example-park\/$/);
  await expect(
    page.getByRole("heading", { name: "範例親子公園", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("每日上午九點至下午五點。")).toBeVisible();
  await expect(page.locator("time")).toHaveText([
    "2026-10-15",
    "2026-10-15",
    "2026-10-15",
  ]);
  await expect(
    page.getByRole("link", { name: "出處：範例管理處公告（虛構）" }).first(),
  ).toHaveAttribute("href", "https://example.org/park");
  await page.getByRole("link", { name: "全部景點", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});
test("keyboard skip link reaches main", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "跳到主要內容" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});
