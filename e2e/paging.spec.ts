import { test, expect, type Page } from "@playwright/test";
import {
  OUTDOOR_SPOTS,
  PAGE_SIZE,
  TOTAL_SPOTS,
  range,
  rangeText,
  spotCards,
} from "./fixture.ts";

const outdoor = "%E6%88%B6%E5%A4%96";
const pager = (page: Page) => page.getByRole("navigation", { name: "分頁" });
const hrefs = (page: Page) =>
  spotCards(page)
    .locator("h3 a")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")!));
const openFilters = (page: Page) =>
  page.locator("#filter-options > summary").click();

test("@smoke pages through every spot via / and /page/N/", async ({ page }) => {
  await page.goto("/");
  await expect(rangeText(page)).toHaveText(range(1, 24, TOTAL_SPOTS));
  const seen = new Set(await hrefs(page));
  expect(seen.size).toBe(PAGE_SIZE);
  await pager(page).getByRole("link", { name: "下一頁" }).click();
  await expect(page).toHaveURL(/\/page\/2\/$/);
  await expect(rangeText(page)).toHaveText(range(25, 48, TOTAL_SPOTS));
  await expect(spotCards(page)).toHaveCount(PAGE_SIZE);
  for (const href of await hrefs(page)) seen.add(href);
  await pager(page).getByRole("link", { name: "下一頁" }).click();
  await expect(page).toHaveURL(/\/page\/3\/$/);
  await expect(rangeText(page)).toHaveText(range(49, 62, TOTAL_SPOTS));
  await expect(spotCards(page)).toHaveCount(TOTAL_SPOTS - 2 * PAGE_SIZE);
  for (const href of await hrefs(page)) seen.add(href);
  expect(seen.size).toBe(TOTAL_SPOTS);
  await expect(pager(page).getByRole("link", { name: "下一頁" })).toHaveCount(
    0,
  );
  await pager(page).getByRole("link", { name: "上一頁" }).click();
  await expect(page).toHaveURL(/\/page\/2\/$/);
  await expect(rangeText(page)).toHaveText(range(25, 48, TOTAL_SPOTS));
});

test("there is no /page/1/ and page 1 is /", async ({ page }) => {
  expect((await page.request.get("/page/1/")).status()).toBe(404);
  expect((await page.request.get("/page/4/")).status()).toBe(404);
  await page.goto("/page/2/");
  await pager(page).getByRole("link", { name: "第 1 頁" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("pages 2 and later omit the home introduction", async ({ page }) => {
  await page.goto("/page/2/");
  await expect(page.locator(".cover, .outing-art, .reading-note")).toHaveCount(
    0,
  );
  await expect(page.getByText("找一處，一起出發。")).toHaveCount(0);
  await expect(page.getByText("官方資訊", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "景點列表 第 2 頁",
  );
  await expect(page.getByRole("searchbox", { name: "搜尋景點" })).toBeVisible();
  await expect(rangeText(page)).toBeVisible();
  await expect(pager(page)).toBeVisible();
  await page.goto("/");
  await expect(page.locator(".cover")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "找一處，一起出發。",
  );
});

test("the range text is the only count announcement", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveCount(1);
  await expect(page.getByRole("status")).toHaveAttribute("aria-live", "polite");
  await expect(
    page.getByRole("heading", { name: "景點列表", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#result-count")).toHaveCount(0);
  expect(
    await page.getByRole("region", { name: "景點列表" }).innerText(),
  ).not.toMatch(/找到 \d+ 個景點/);
});

test("paginator shows prev / current of total on mobile and page numbers on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/page/2/");
  await expect(pager(page).getByText("2 / 3")).toBeVisible();
  await expect(
    pager(page).getByRole("link", { name: "上一頁" }),
  ).toHaveAttribute("href", "/");
  await expect(
    pager(page).getByRole("link", { name: "下一頁" }),
  ).toHaveAttribute("href", "/page/3/");
  await expect(
    pager(page).getByRole("link", { name: /^第 \d+ 頁$/ }),
  ).toHaveCount(0);
  for (const link of await pager(page).getByRole("link").all())
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.setViewportSize({ width: 1366, height: 900 });
  await expect(pager(page).getByText("2 / 3")).toBeHidden();
  const links = pager(page).getByRole("link");
  await expect(links).toHaveText(["上一頁", "1", "2", "3", "下一頁"]);
  await expect(links.nth(2)).toHaveAttribute("aria-current", "page");
  await expect(links.nth(1)).toHaveAttribute("href", "/");
  await expect(links.nth(3)).toHaveAttribute("href", "/page/3/");
  await expect(pager(page).getByRole("textbox")).toHaveCount(0);
  await expect(pager(page).getByRole("spinbutton")).toHaveCount(0);
});

test("a skip link at the start of the list jumps to the paginator", async ({
  page,
}) => {
  await page.goto("/page/2/");
  const skip = page.getByRole("link", { name: "跳到分頁" });
  await expect(skip).toHaveAttribute("href", "#paginator");
  await skip.focus();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(pager(page)).toBeFocused();
  // 跳過去之後，下一個 Tab 停點是分頁器裡的連結，不是 24 張卡片
  await page.keyboard.press("Tab");
  await expect(pager(page).getByRole("link", { name: "上一頁" })).toBeFocused();
});

test("a static page change moves focus to the range text", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "下一頁" }).click();
  await expect(page).toHaveURL(/\/page\/2\/$/);
  await expect(rangeText(page)).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "景點列表", exact: true }),
  ).toBeInViewport();
});

test("@smoke conditioned paging stays on /?… with pushState and focuses the range text", async ({
  page,
}) => {
  await page.goto("/");
  const history = await page.evaluate(() => window.history.length);
  await openFilters(page);
  await page.getByLabel("環境", { exact: true }).selectOption("戶外");
  await expect(rangeText(page)).toHaveText(range(1, 24, OUTDOOR_SPOTS));
  await expect(page).toHaveURL(new RegExp(`/\\?setting=${outdoor}$`));
  expect(await page.evaluate(() => window.history.length)).toBe(history);
  const next = pager(page).getByRole("link", { name: "下一頁" });
  await expect(next).toHaveAttribute("href", `/?setting=${outdoor}&page=2`);
  await next.click();
  await expect(page).toHaveURL(new RegExp(`/\\?setting=${outdoor}&page=2$`));
  await expect(rangeText(page)).toHaveText(
    range(25, OUTDOOR_SPOTS, OUTDOOR_SPOTS),
  );
  await expect(spotCards(page)).toHaveCount(OUTDOOR_SPOTS - PAGE_SIZE);
  await expect(rangeText(page)).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "景點列表", exact: true }),
  ).toBeInViewport();
  expect(await page.evaluate(() => window.history.length)).toBe(history + 1);
  await expect(pager(page).getByRole("link", { name: "下一頁" })).toHaveCount(
    0,
  );
});

test("changing any condition returns to page 1 without adding history", async ({
  page,
}) => {
  await page.goto(`/?setting=${outdoor}&page=2`);
  await expect(rangeText(page)).toHaveText(
    range(25, OUTDOOR_SPOTS, OUTDOOR_SPOTS),
  );
  const history = await page.evaluate(() => window.history.length);
  await openFilters(page);
  await page.getByLabel("類型", { exact: true }).selectOption("步道");
  await expect(rangeText(page)).toHaveText(/^第 1(–\d+)? 筆，共 \d+ 筆$/);
  const url = new URL(page.url());
  expect(url.searchParams.get("page")).toBeNull();
  expect(url.searchParams.get("kind")).toBe("步道");
  expect(await page.evaluate(() => window.history.length)).toBe(history);
  // 文字查詢也一樣
  await page.goto(`/?setting=${outdoor}&page=2`);
  await page.getByRole("searchbox").fill("範例");
  await page.getByRole("searchbox").press("Enter");
  await expect(rangeText(page)).toHaveText(/^第 1(–\d+)? 筆，共 \d+ 筆$/);
  expect(new URL(page.url()).searchParams.get("page")).toBeNull();
});

test("Back and Forward restore conditions and page from the URL", async ({
  page,
}) => {
  await page.goto("/");
  await openFilters(page);
  await page.getByLabel("環境", { exact: true }).selectOption("戶外");
  await expect(rangeText(page)).toHaveText(range(1, 24, OUTDOOR_SPOTS));
  await pager(page).getByRole("link", { name: "下一頁" }).click();
  await expect(rangeText(page)).toHaveText(
    range(25, OUTDOOR_SPOTS, OUTDOOR_SPOTS),
  );
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/\\?setting=${outdoor}$`));
  await expect(rangeText(page)).toHaveText(range(1, 24, OUTDOOR_SPOTS));
  await expect(page.getByLabel("環境", { exact: true })).toHaveValue("戶外");
  await page.goForward();
  await expect(rangeText(page)).toHaveText(
    range(25, OUTDOOR_SPOTS, OUTDOOR_SPOTS),
  );
  await expect(page.getByLabel("環境", { exact: true })).toHaveValue("戶外");
});

test("Back from a spot restores the conditioned page and position", async ({
  page,
}) => {
  await page.goto(`/?setting=${outdoor}&page=2`);
  await expect(rangeText(page)).toHaveText(
    range(25, OUTDOOR_SPOTS, OUTDOOR_SPOTS),
  );
  const link = spotCards(page).locator("h3 a").nth(10);
  const href = (await link.getAttribute("href"))!;
  await link.scrollIntoViewIfNeeded();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`page=2$`));
  await expect(rangeText(page)).toHaveText(
    range(25, OUTDOOR_SPOTS, OUTDOOR_SPOTS),
  );
  await expect(page.locator(`.spots a[href="${href}"]`)).toBeFocused();
});

test("out-of-range and invalid page numbers are corrected in the URL", async ({
  page,
}) => {
  await page.goto(`/?setting=${outdoor}&page=99`);
  await expect(rangeText(page)).toHaveText(
    range(25, OUTDOOR_SPOTS, OUTDOOR_SPOTS),
  );
  await expect(page).toHaveURL(new RegExp(`page=2$`));
  for (const bad of ["0", "-3", "abc", "1.5", "1"]) {
    await page.goto(`/?setting=${outdoor}&page=${bad}`);
    await expect(rangeText(page)).toHaveText(range(1, 24, OUTDOOR_SPOTS));
    await expect(page).toHaveURL(new RegExp(`/\\?setting=${outdoor}$`));
  }
});

test("a page parameter without conditions goes to the static page", async ({
  page,
}) => {
  await page.goto("/?page=2");
  await expect(page).toHaveURL(/\/page\/2\/$/);
  await expect(rangeText(page)).toHaveText(range(25, 48, TOTAL_SPOTS));
  await page.goto("/?page=1");
  await expect(page).toHaveURL(/\/$/);
  await expect(rangeText(page)).toHaveText(range(1, 24, TOTAL_SPOTS));
});

test("@smoke applying a filter on /page/N/ navigates to /?…", async ({
  page,
}) => {
  await page.goto("/page/2/");
  await openFilters(page);
  await page.getByLabel("環境", { exact: true }).selectOption("戶外");
  await expect(page).toHaveURL(new RegExp(`/\\?setting=${outdoor}$`));
  await expect(rangeText(page)).toHaveText(range(1, 24, OUTDOOR_SPOTS));
  await expect(page.getByLabel("環境", { exact: true })).toHaveValue("戶外");
  await page.goto("/page/3/");
  await page.getByRole("searchbox").fill("範例");
  await page.getByRole("searchbox").press("Enter");
  await expect(page).toHaveURL(/\/\?query=%E7%AF%84%E4%BE%8B$/);
  await expect(rangeText(page)).toHaveText(range(1, 2, 2));
});

test("typing on /page/N/ does not navigate until the search is submitted", async ({
  page,
}) => {
  await page.goto("/page/2/");
  await page.getByRole("searchbox").pressSequentially("範例", { delay: 100 });
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/page\/2\/$/);
  await expect(page.getByRole("searchbox")).toHaveValue("範例");
});

test("unconditioned pages do not download the list JSON until search or filters are used", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/spot-list/")) requests.push(request.url());
  });
  for (const route of ["/", "/page/2/"]) {
    requests.length = 0;
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    expect(requests, route).toEqual([]);
    await page.getByRole("searchbox", { name: "搜尋景點" }).focus();
    await expect.poll(() => requests.length, route).toBe(1);
    await page.waitForLoadState("networkidle");
  }
  requests.length = 0;
  await page.goto("/");
  await openFilters(page);
  await expect.poll(() => requests.length).toBe(1);
});

test("a conditioned URL shows the static first page with the loading text, then the results", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/spot-list/*.json", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(`/?setting=${outdoor}`);
  await expect(rangeText(page)).toHaveText("載入中");
  await expect(rangeText(page)).toHaveAttribute("data-state", "loading");
  await expect(page.locator(".spots")).toHaveAttribute("aria-busy", "true");
  await expect(spotCards(page)).toHaveCount(PAGE_SIZE);
  const staticFirst = (await hrefs(page))[0];
  release();
  await expect(rangeText(page)).toHaveText(range(1, 24, OUTDOOR_SPOTS));
  await expect(page.locator(".spots")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByLabel("環境", { exact: true })).toHaveValue("戶外");
  expect(staticFirst).toBeTruthy();
});

test("a failed list JSON keeps the static first page and explains it", async ({
  page,
}) => {
  await page.route("**/spot-list/*.json", (route) => route.abort());
  await page.goto(`/?setting=${outdoor}`);
  await expect(rangeText(page)).toContainText("篩選資料暫時無法載入");
  await expect(spotCards(page)).toHaveCount(PAGE_SIZE);
  await expect(page.locator(".spots")).toHaveAttribute("aria-busy", "false");
});

test("client-rendered cards are identical to the static markup", async ({
  page,
}) => {
  await page.goto("/");
  const same = await page.evaluate(async () => {
    const staticHtml = new DOMParser()
      .parseFromString(await (await fetch("/")).text(), "text/html")
      .querySelector(".spots")!.innerHTML;
    return staticHtml;
  });
  // ?page=1 是不正規的網址，前端會渲染列表 JSON 並把網址修正回 /
  await page.goto("/?page=1");
  await expect(page).toHaveURL(/\/$/);
  await expect(rangeText(page)).toHaveText(range(1, 24, TOTAL_SPOTS));
  expect(await page.locator(".spots").innerHTML()).toBe(same);
});

test("without JavaScript every spot is reachable through / and /page/N/", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByText("搜尋與篩選需要 JavaScript")).toBeVisible();
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    const seen = new Set<string>();
    for (const expected of [
      range(1, 24, TOTAL_SPOTS),
      range(25, 48, TOTAL_SPOTS),
      range(49, 62, TOTAL_SPOTS),
    ]) {
      await expect(rangeText(page)).toHaveText(expected);
      for (const href of await hrefs(page)) seen.add(href);
      const next = pager(page).getByRole("link", { name: "下一頁" });
      if (await next.count()) await next.click();
    }
    expect(seen.size).toBe(TOTAL_SPOTS);
  } finally {
    await context.close();
  }
});

test("without JavaScript a conditioned URL shows the unfiltered first page and the note", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`/?setting=${outdoor}&page=2`);
    await expect(rangeText(page)).toHaveText(range(1, 24, TOTAL_SPOTS));
    await expect(spotCards(page)).toHaveCount(PAGE_SIZE);
    await expect(page.getByText("搜尋與篩選需要 JavaScript")).toBeVisible();
    await expect(page.getByRole("searchbox")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("the home illustration is not downloaded at mobile width but still shows on desktop", async ({
  page,
}) => {
  const illustration: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("family-outing"))
      illustration.push(request.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
  expect(illustration).toEqual([]);
  await expect(page.locator(".outing-art")).toBeHidden();
  // 先離開手機版頁面再放大視窗：否則舊頁面會因視窗變寬自行載入插畫，
  // 與接著重新載入的請求湊成兩次，計數就不穩定
  await page.goto("about:blank");
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  const image = page.locator(".outing-art img");
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBe(1536);
  expect(illustration).toHaveLength(1);
});
