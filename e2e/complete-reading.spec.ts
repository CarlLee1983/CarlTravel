import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("complete spot keeps the reading order, states, citations, and map exits", async ({
  page,
}) => {
  await page.goto("/spots/example-museum/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "範例探索館",
  );
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "親子清單",
    "開放時間與費用",
    "交通與停車",
    "設施",
    "跟孩子一起看",
    "原作者心得",
    "Agent 建議",
    "周邊安排",
    "來源與官方出處",
  ]);
  await expect(page.locator("time")).toHaveCount(5);
  await expect(
    page.getByText("資料可能過期，出發前請重新確認官方公告。"),
  ).toHaveCount(5);
  const checklist = page
    .getByRole("heading", { name: "親子清單" })
    .locator("..", { hasText: "親子清單" });
  await expect(checklist.getByText("推車友善")).toBeVisible();
  await expect(checklist.getByText("哺乳室")).toBeVisible();
  await expect(checklist.getByText("親子廁所")).toBeVisible();
  await expect(checklist.locator("dl > div")).toHaveText([
    /推車友善\s*有 · 平面入口可通行推車。\s*出處：範例探索館公告/,
    /哺乳室\s*無\s*出處：範例探索館公告/,
    /親子廁所\s*未知/,
    /雨天備案\s*有\s*出處：範例探索館公告/,
    /無障礙設施\s*未知/,
  ]);
  await expect(page.getByText("官方未公布")).toBeVisible();
  await expect(page.getByText("官方資訊有衝突")).toBeVisible();
  await expect(page.getByText("全票一百元。")).toBeVisible();
  await expect(page.getByText("全票一百二十元。")).toBeVisible();
  await expect(
    page.getByText("票價說法不一致，出發前請聯絡範例探索館確認。"),
  ).toBeVisible();
  await expect(page.getByText("原文無法讀取")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "原作者心得" }).locator("+ article"),
  ).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: /範例家庭探索紀錄/ }).first(),
  ).toHaveAttribute("href", "https://example.org/story");
  await expect(
    page.getByText(
      "開放資料顯名：範例資料提供機關（2026）「範例定位資料集」版本 1",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Google Maps 開啟地圖" }),
  ).toHaveAttribute(
    "href",
    "https://www.google.com/maps/search/?api=1&query=25.01%2C121.46",
  );
  await expect(
    page.getByRole("link", { name: "OpenStreetMap 開啟地圖" }),
  ).toHaveAttribute(
    "href",
    "https://www.openstreetmap.org/?mlat=25.01&mlon=121.46#map=16/25.01/121.46",
  );
  await expect(page.locator("iframe")).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("basic spot omits absent optional reading sections", async ({ page }) => {
  await page.goto("/spots/example-park/");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "親子清單",
    "開放時間與費用",
    "交通與停車",
    "來源與官方出處",
  ]);
  await expect(
    page.getByRole("link", { name: "Google Maps 開啟地圖" }),
  ).toHaveAttribute("href", /query=/);
  await expect(
    page.getByRole("link", { name: "OpenStreetMap 開啟地圖" }),
  ).toHaveAttribute("href", /search\?query=/);
});
