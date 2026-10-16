import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { decodeList, type ListEntry } from "../src/content/list.ts";
import {
  PAGE_SIZE,
  RANGE_RESULT,
  TOTAL_SPOTS,
  hold,
  range,
} from "./fixture.ts";

const status = (page: Page) => page.getByRole("status");
const select = (page: Page, label: string) =>
  page.getByLabel(label, { exact: true });
const details = (page: Page) => page.locator("#filter-options");
const openFilters = (page: Page) =>
  page.locator("#filter-options > summary").click();
const cards = (page: Page) =>
  page
    .getByRole("region", { name: /景點列表/ })
    .getByRole("heading", { level: 3 });
const params = (page: Page) => new URL(page.url()).searchParams;
const noMatch = "zzzznomatchingplace";

// 與頁面用同一份列表 JSON：預期筆數由資料獨立算出，不從畫面上讀
async function loadEntries(page: Page): Promise<ListEntry[]> {
  await page.goto("/");
  const url = await page.locator(".results").getAttribute("data-list-url");
  const response = await page.request.get(url!);
  expect(response.ok()).toBe(true);
  return decodeList(await response.json());
}

// 兩個各自有景點、但沒有任何景點同時符合的縣市與類型
function emptyPair(entries: ListEntry[]) {
  for (const county of new Set(entries.map((e) => e.county)))
    for (const kind of new Set(entries.map((e) => e.kind)))
      if (!entries.some((e) => e.county === county && e.kind === kind))
        return {
          county,
          kind,
          inCounty: entries.filter((e) => e.county === county).length,
          ofKind: entries.filter((e) => e.kind === kind).length,
        };
  throw new Error("fixture 找不到互斥的縣市與類型");
}

test("age note counts unknown-age spots under the current conditions and its link drops the age", async ({
  page,
}) => {
  const entries = await loadEntries(page);
  const outdoorUnknown = entries.filter(
    (e) => !e.age && e.setting === "戶外",
  ).length;
  expect(outdoorUnknown).toBeGreaterThan(0);
  await page.goto(`/?age=${encodeURIComponent("3–6 歲")}&setting=戶外`);
  await expect(status(page)).toHaveText(RANGE_RESULT);
  const note = page.getByRole("link", {
    name: `另有 ${outdoorUnknown} 筆年齡未標示，未列入`,
  });
  await expect(note).toBeVisible();
  // 說明在範圍文字下方，不在 role=status 之內
  await expect(status(page)).not.toContainText("年齡未標示");
  const listed = Number(
    /共 (\d+) 筆/.exec((await status(page).textContent())!)![1],
  );
  const matching = entries.filter(
    (e) =>
      e.setting === "戶外" && e.age && e.age.min <= 6 && (e.age.max ?? 99) >= 3,
  ).length;
  expect(listed).toBe(matching);
  await note.click();
  await expect(page).toHaveURL(/\?setting=%E6%88%B6%E5%A4%96$/);
  await expect(status(page)).toContainText(
    `共 ${entries.filter((e) => e.setting === "戶外").length} 筆`,
  );
  await expect(status(page)).toBeFocused();
  await expect(note).toBeHidden();
  await openFilters(page);
  await expect(select(page, "年齡帶")).toHaveValue("");
  await expect(select(page, "環境")).toHaveValue("戶外");
  await page.goBack();
  await expect(
    page.getByRole("link", { name: /年齡未標示，未列入/ }),
  ).toBeVisible();
});

test("no age note when no age band is selected", async ({ page }) => {
  await page.goto("/?setting=戶外");
  await expect(status(page)).toHaveText(RANGE_RESULT);
  await expect(
    page.getByRole("link", { name: /年齡未標示，未列入/ }),
  ).toBeHidden();
});

test("@smoke empty results list every condition with its removal count, and each link removes only that one", async ({
  page,
}) => {
  const entries = await loadEntries(page);
  const pair = emptyPair(entries);
  const { county, kind } = pair;
  await page.goto(
    `/?county=${encodeURIComponent(county)}&kind=${encodeURIComponent(kind)}`,
  );
  await expect(status(page)).toHaveText("沒有符合條件的景點");
  const panel = page.locator("#no-results");
  await expect(panel).toBeVisible();
  await expect(panel.locator("li")).toHaveCount(2);
  const removeCounty = panel.getByRole("link", {
    name: `移除縣市：${county}，移除後可得 ${pair.ofKind} 筆`,
  });
  const removeKind = panel.getByRole("link", {
    name: `移除類型：${kind}，移除後可得 ${pair.inCounty} 筆`,
  });
  await expect(removeCounty).toHaveText(`移除後可得 ${pair.ofKind} 筆`);
  await expect(removeKind).toHaveText(`移除後可得 ${pair.inCounty} 筆`);
  expect(
    new URL((await removeKind.getAttribute("href"))!, page.url()).search,
  ).toBe(`?county=${encodeURIComponent(county)}`);
  await removeKind.click();
  await expect(status(page)).toContainText(`共 ${pair.inCounty} 筆`);
  expect(params(page).get("county")).toBe(county);
  expect(params(page).get("kind")).toBeNull();
  await expect(panel).toBeHidden();
  await page.goBack();
  await expect(status(page)).toHaveText("沒有符合條件的景點");
  await panel
    .getByRole("link", {
      name: `移除縣市：${county}，移除後可得 ${pair.ofKind} 筆`,
    })
    .click();
  await expect(status(page)).toContainText(`共 ${pair.ofKind} 筆`);
  expect(params(page).get("kind")).toBe(kind);
  expect(params(page).get("county")).toBeNull();
});

test("a text query that matches nothing is listed first and removing it leaves the filter results", async ({
  page,
}) => {
  const entries = await loadEntries(page);
  const county = entries[0]!.county;
  const inCounty = entries.filter((e) => e.county === county).length;
  await page.goto(`/?query=${noMatch}&county=${encodeURIComponent(county)}`);
  await expect(status(page)).toHaveText("沒有符合條件的景點");
  const items = page.locator("#no-results li");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText(`搜尋：${noMatch}`);
  await expect(items.nth(1)).toContainText(`縣市：${county}`);
  // 文字沒有命中時，拿掉縣市仍是 0 筆；拿掉文字則只剩縣市條件
  await expect(items.nth(1).getByRole("link")).toHaveText("移除後可得 0 筆");
  await items.nth(0).getByRole("link").click();
  await expect(status(page)).toContainText(`共 ${inCounty} 筆`);
  await expect(page.getByRole("searchbox")).toHaveValue("");
  expect(params(page).get("query")).toBeNull();
});

test("@smoke the clear-conditions link returns to all spots and puts focus in the search box", async ({
  page,
}) => {
  await page.goto(`/?query=${noMatch}&kind=%E5%85%AC%E5%9C%92`);
  await expect(status(page)).toHaveText("沒有符合條件的景點");
  await page.getByRole("link", { name: "清除條件" }).click();
  await expect(status(page)).toHaveText(range(1, PAGE_SIZE, TOTAL_SPOTS));
  await expect(page.getByRole("searchbox")).toBeFocused();
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page.locator("#no-results")).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  await expect(cards(page)).toHaveCount(PAGE_SIZE);
});

for (const width of [390, 1366]) {
  test(`@smoke "查看 N 筆結果" collapses the filters, scrolls to and focuses the range text at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await openFilters(page);
    const y0 = await page.evaluate(() => scrollY);
    await select(page, "環境").selectOption("戶外");
    // 結果畫出時網址同時更新，等網址才不會讀到套用前的範圍文字
    await expect.poll(() => params(page).get("setting")).toBe("戶外");
    await expect(status(page)).toHaveText(RANGE_RESULT);
    const total = Number(
      /共 (\d+) 筆/.exec((await status(page).textContent())!)![1],
    );
    // 改選項即時套用，但不收合、不捲動、不搶走焦點
    await expect(details(page)).toHaveAttribute("open", "");
    await expect(status(page)).not.toBeFocused();
    expect(await page.evaluate(() => scrollY)).toBe(y0);
    const button = page.getByRole("button", { name: `查看 ${total} 筆結果` });
    await expect(button).toBeVisible();
    await button.click();
    await expect(details(page)).not.toHaveAttribute("open", "");
    await expect(status(page)).toBeFocused();
    await expect(status(page)).toBeInViewport();
    await expect(button).toBeHidden();
  });
}

test("the results button follows the result count", async ({ page }) => {
  await page.goto("/");
  await openFilters(page);
  await expect(
    page.getByRole("button", { name: `查看 ${TOTAL_SPOTS} 筆結果` }),
  ).toBeVisible();
  await page.getByRole("searchbox").fill("範例");
  await page.getByRole("searchbox").press("Enter");
  await expect(status(page)).toHaveText(range(1, 2, 2));
  await expect(
    page.getByRole("button", { name: "查看 2 筆結果" }),
  ).toBeVisible();
});

test("loading list data, then waiting for the index, then results: each state is shown in order and previous results stay", async ({
  page,
}) => {
  const rows = hold(page, "**/spot-list/*.json");
  const index = hold(page, "**/pagefind/pagefind.js");
  await page.goto("/?query=summaryprobe");
  await rows.requested;
  await index.requested;
  await expect(status(page)).toHaveText("載入中");
  await expect(page.locator(".spots")).toHaveAttribute("aria-busy", "true");
  await expect(cards(page)).toHaveCount(PAGE_SIZE);
  // 列表資料先到、索引還沒：進入「搜尋中…」，仍保留上一次（靜態第 1 頁）的結果，筆數不變
  rows.release();
  await expect(status(page)).toHaveText("搜尋中…");
  await expect(status(page)).toHaveAttribute("data-state", "loading");
  await expect(page.locator(".spots")).toHaveAttribute("aria-busy", "true");
  await expect(cards(page)).toHaveCount(PAGE_SIZE);
  await openFilters(page);
  const newTaipei = select(page, "縣市").locator("option", {
    hasText: /^新北市/,
  });
  await expect(newTaipei).not.toHaveText("新北市（1）");
  index.release();
  await expect(status(page)).toHaveText(range(1, 1, 1));
  await expect(page.locator(".spots")).toHaveAttribute("aria-busy", "false");
  await expect(cards(page)).toHaveText(["範例探索館"]);
  await expect(newTaipei).toHaveText("新北市（1）");
});

test("@smoke 台 and 臺 find the same spots, whichever spelling the page or the query uses", async ({
  page,
}) => {
  const entries = await loadEntries(page);
  const search = async (query: string) => {
    await page.getByRole("searchbox").fill(query);
    await page.getByRole("searchbox").press("Enter");
    // 結果畫出時網址同時更新（同一個同步區塊），以此確定讀到的是這次查詢的結果
    await expect.poll(() => params(page).get("query")).toBe(query);
    await expect(status(page)).toHaveText(RANGE_RESULT);
    return cards(page).allTextContents();
  };
  // 縣市寫成「臺北市」：用「台北」查
  const viaTai = await search("台北");
  const viaTai2 = await search("臺北");
  expect(viaTai).toContain("範例親子公園");
  expect(viaTai2).toEqual(viaTai);
  // 名稱含「台」的景點：用「臺」查也要找得到
  const named = entries.find((e) => e.name.includes("台"));
  if (named) {
    const withTai = await search(named.name);
    const withTai2 = await search(named.name.replaceAll("台", "臺"));
    expect(withTai).toContain(named.name);
    expect(withTai2).toEqual(withTai);
  }
  expect(await search("臺北市")).toEqual(await search("台北市"));
});

for (const width of [360, 390, 430, 1366, 1920]) {
  test(`age note and empty-result recovery stay accessible at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const entries = await loadEntries(page);
    const pair = emptyPair(entries);
    const noOverflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

    await page.goto(`/?age=${encodeURIComponent("3–6 歲")}`);
    await expect(
      page.getByRole("link", { name: /年齡未標示，未列入/ }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await noOverflow()).toBe(true);

    await page.goto(
      `/?query=${noMatch}&county=${encodeURIComponent(pair.county)}&kind=${encodeURIComponent(pair.kind)}`,
    );
    await expect(page.locator("#no-results li")).toHaveCount(3);
    await expect(page.getByRole("link", { name: "清除條件" })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await noOverflow()).toBe(true);
  });
}
