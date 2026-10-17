import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openAllSections } from "./sections.ts";

test("@smoke complete spot keeps the reading order, states, citations, and map exits", async ({
  page,
}) => {
  await page.goto("/spots/example-museum/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "範例探索館",
  );
  // 摺疊列本身就是目錄：順序即閱讀順序，預設只展開親子清單
  const summaries = page.locator("details > summary > .section-title");
  await expect(summaries).toHaveText([
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
  await expect(page.locator("details[open]")).toHaveCount(1);
  await expect(page.locator("details#checklist")).toHaveAttribute("open", "");
  const checklist = page.locator("#checklist");
  // 親子清單只列已知項目，未知收成一列
  await expect(checklist.locator("dl > div")).toHaveText([
    /建議年齡\s*3–12 歲/,
    /推車友善\s*有 平面入口可通行推車。\s*出處：範例探索館公告/,
    /哺乳室\s*沒有\s*出處：範例探索館公告/,
    /雨天備案\s*有\s*出處：範例探索館公告/,
  ]);
  await expect(checklist).toContainText(
    "未知 2 項：親子廁所、無障礙設施，未知不代表沒有，可向 範例探索館",
  );
  await expect(checklist.getByText("親子廁所")).toHaveCount(1);
  await openAllSections(page);
  await expect(page.locator("time")).toHaveCount(5);
  await expect(checklist.locator(".info-label")).toHaveText(
    "官方資訊 · 查證 2020-01-01",
  );
  await expect(page.getByText("查證已逾一年，請再確認")).toHaveCount(5);
  const sections = page.locator(".acc");
  await expect(sections.getByText("官方未公布")).toBeVisible();
  await expect(sections.getByText("官方資訊有衝突")).toBeVisible();
  await expect(page.getByText("全票一百元。")).toBeVisible();
  await expect(page.getByText("全票一百二十元。")).toBeVisible();
  await expect(
    page.getByText("票價說法不一致，出發前請聯絡範例探索館確認。"),
  ).toBeVisible();
  await expect(page.getByText("原文無法讀取")).toBeVisible();
  await expect(page.locator("#author .note")).toHaveCount(1);
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
  // 外部連結：可見的「↗」、報讀的「（外部網站）」，同一分頁開啟
  const external = page
    .getByRole("link", { name: "出處：範例探索館公告" })
    .first();
  await expect(external).toContainText("↗");
  await expect(external).toContainText("（外部網站）");
  await expect(external).not.toHaveAttribute("target", /.*/);
  await expect(page.locator("iframe")).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("basic spot lists unorganised official sections instead of dropping them", async ({
  page,
}) => {
  await page.goto("/spots/example-park/");
  // 有資料的章節是摺疊列；官方章節沒有資料時列成不能展開的「尚未整理」
  await expect(page.locator("details > summary > .section-title")).toHaveText([
    "親子清單",
    "開放時間與費用",
    "交通與停車",
    "來源與官方出處",
  ]);
  await expect(page.locator(".acc-missing")).toHaveText([
    "設施　尚未整理",
    "跟孩子一起看　尚未整理",
  ]);
  await expect(page.locator(".acc-missing summary")).toHaveCount(0);
  await openAllSections(page);
  await expect(page.locator("#hours")).toContainText(
    "費用尚未整理，未列出不代表免費",
  );
  await expect(
    page.getByRole("link", { name: "Google Maps 開啟地圖" }),
  ).toHaveAttribute("href", /query=/);
  await expect(
    page.getByRole("link", { name: "OpenStreetMap 開啟地圖" }),
  ).toHaveAttribute("href", /search\?query=/);
});
