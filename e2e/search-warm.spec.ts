import { test, expect } from "@playwright/test";
import { rangeText } from "./fixture.ts";

test("focusing the search box warms the list JSON and the Pagefind index", async ({
  page,
}) => {
  // Pagefind 在 worker 裡載入索引，worker 的請求只在 context 層看得到
  const urls: string[] = [];
  page.context().on("request", (request) => urls.push(request.url()));
  await page.goto("/");
  await expect(rangeText(page)).toHaveText(/^第 1–24 筆/);
  // 聚焦之前什麼都不載入
  expect(urls.filter((url) => /spot-list|\/pagefind\//.test(url))).toEqual([]);

  await page.getByRole("searchbox").focus();
  await expect
    .poll(() => urls.some((url) => url.includes("/spot-list/")))
    .toBe(true);
  expect(urls.some((url) => url.endsWith("/pagefind/pagefind.js"))).toBe(true);
  expect(urls.some((url) => url.endsWith("/pagefind/spot-ids.json"))).toBe(
    true,
  );
  // init 讓 worker 取得 entry、meta 與 wasm，第一次搜尋只剩索引片段
  await expect
    .poll(() => urls.some((url) => url.includes("/pagefind/wasm.")))
    .toBe(true);

  // 暖好之後第一次搜尋不再重抓這些檔案
  const before = urls.length;
  await page.getByRole("searchbox").fill("公園");
  await expect(rangeText(page)).toHaveText(/^第 .+ 筆，共 .+ 筆$/);
  const later = urls.slice(before);
  expect(
    later.filter((url) => /pagefind\.js|spot-ids|wasm\./.test(url)),
  ).toEqual([]);
});
