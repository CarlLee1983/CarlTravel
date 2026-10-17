import { test, expect, type Page } from "@playwright/test";
import {
  PAGE_SIZE,
  TOTAL_SPOTS,
  range,
  rangeText,
  spotCards,
} from "./fixture.ts";

// 記下列表 JSON 的請求：無條件頁面不得為了導向而下載它
function watchListJson(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/spot-list/")) requests.push(request.url());
  });
  return requests;
}

test("/?page=N without conditions redirects before loading the list JSON", async ({
  page,
}) => {
  const listRequests = watchListJson(page);
  await page.goto("/?page=2");
  await expect(page).toHaveURL(/\/page\/2\/$/);
  await expect(rangeText(page)).toHaveText(range(25, 48, TOTAL_SPOTS));
  // 超過最後一頁導向最後一頁
  await page.goto("/?page=99");
  await expect(page).toHaveURL(/\/page\/3\/$/);
  await expect(rangeText(page)).toHaveText(range(49, 62, TOTAL_SPOTS));
  expect(listRequests).toEqual([]);
});

test("/?page=1 and invalid page values fall back to / without the list JSON", async ({
  page,
}) => {
  const listRequests = watchListJson(page);
  for (const bad of ["1", "0", "abc", "-3"]) {
    await page.goto(`/?page=${bad}`);
    await expect(page).toHaveURL(/\/$/);
    await expect(rangeText(page)).toHaveText(range(1, 24, TOTAL_SPOTS));
    await expect(spotCards(page)).toHaveCount(PAGE_SIZE);
  }
  expect(listRequests).toEqual([]);
});

test("a condition that normalizes away loads the list JSON before settling on /", async ({
  page,
}) => {
  const listRequests = watchListJson(page);
  // 縣市不存在：條件被捨棄，要載入列表 JSON 才知道，網址修正回 /
  await page.goto("/?county=nowhere");
  await expect(page).toHaveURL(/\/$/);
  await expect(rangeText(page)).toHaveText(range(1, 24, TOTAL_SPOTS));
  expect(listRequests).toHaveLength(1);
});
