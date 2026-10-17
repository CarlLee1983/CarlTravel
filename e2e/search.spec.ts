import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  PAGE_SIZE,
  RANGE_RESULT,
  TOTAL_SPOTS,
  hold,
  range,
} from "./fixture.ts";

async function openFilters(page: import("@playwright/test").Page) {
  await page.locator("#filter-options > summary").click();
}

test("built search index includes only the allowed spot text", async ({
  page,
}) => {
  await page.goto("/");
  const included = [
    "範例探索館",
    "新北市",
    "板橋區",
    "summaryprobe",
    "paraphraseprobe",
    "tipprobe",
    "learningprobe",
    "activityprobe",
  ];
  const excluded = [
    "officialprobe",
    "quoteprobe",
    "nearbyprobe",
    "sourceprobe",
    "addressprobe",
    "checklistprobe",
    "姓名標示",
    "這條路",
  ];
  const { matches, records } = await page.evaluate(
    async (terms) => {
      const path = "/pagefind/pagefind.js";
      const pagefind = await import(path);
      const found: Record<string, string[]> = {};
      for (const term of terms) {
        const result = await pagefind.search(term);
        found[term] = await Promise.all(
          result.results.map(
            async (hit: { data(): Promise<{ url: string }> }) =>
              (await hit.data()).url,
          ),
        );
      }
      const all = await pagefind.search(null);
      return {
        matches: found,
        records: (await Promise.all(
          all.results.map(
            (hit: { data(): Promise<{ url: string; content: string }> }) =>
              hit.data(),
          ),
        )) as { url: string; content: string }[],
      };
    },
    [...included, ...excluded],
  );
  // 縣市與行政區也會命中產生景點，只要求手寫的完整案例在內
  for (const term of ["新北市", "板橋區"])
    expect(matches[term], term).toContain("/spots/example-museum/");
  for (const term of included.filter((t) => !["新北市", "板橋區"].includes(t)))
    expect(matches[term], term).toEqual(["/spots/example-museum/"]);
  // 產生景點的中文虛構文字可能與這兩個詞共用單字；只要求手寫案例沒有被索引到
  const cjkExcluded = ["姓名標示", "這條路"];
  for (const term of excluded.filter((t) => !cjkExcluded.includes(t)))
    expect(matches[term], term).toEqual([]);
  for (const term of cjkExcluded)
    for (const url of ["/spots/example-museum/", "/spots/example-park/"])
      expect(matches[term], term).not.toContain(url);
  const urls = records.map((record) => record.url);
  expect(urls).toHaveLength(TOTAL_SPOTS);
  expect(urls).toEqual(
    expect.arrayContaining(["/spots/example-museum/", "/spots/example-park/"]),
  );
  const content = records.map((record) => record.content).join(" ");
  for (const text of [
    ...excluded,
    "一百二十元",
    "飲水台",
    "範例食堂",
    "範例家庭探索紀錄",
    "我們在葉片展區停留",
    "範例路二號",
    "博物館",
  ])
    expect(content).not.toContain(text);
});

test("@smoke text search narrows the list to matching spots", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: "搜尋景點" }).fill("summaryprobe");
  await page.getByRole("searchbox", { name: "搜尋景點" }).press("Enter");
  await expect(page.getByRole("status")).toHaveText(range(1, 1, 1));
  await expect(
    page
      .getByRole("region", { name: /景點列表/ })
      .getByRole("heading", { level: 3 }),
  ).toHaveText(["範例探索館"]);
});

test("search and four combined filters preserve list details, order, and keyboard clearing", async ({
  page,
}) => {
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "搜尋景點" });
  const cards = page
    .getByRole("region", { name: /景點列表/ })
    .getByRole("heading", { level: 3 });
  await expect(search).toBeEnabled();
  await openFilters(page);
  await expect(
    page.getByLabel("縣市", { exact: true }).locator("option"),
  ).toContainText(["全部縣市", "臺北市", "新北市"]);
  await expect(
    page.getByLabel("類型", { exact: true }).locator("option"),
  ).toContainText(["全部類型", "公園", "博物館"]);
  await expect(
    page.getByLabel("環境", { exact: true }).locator("option"),
  ).toContainText(["全部環境", "戶外", "室內外皆有"]);
  await expect(
    page.getByLabel("年齡帶", { exact: true }).locator("option"),
  ).toContainText(["全部年齡", "3–6 歲", "7–12 歲"]);
  // 年齡未標示不是可選的年齡帶，改由範圍文字下方的說明處理
  await expect(
    page
      .getByLabel("年齡帶", { exact: true })
      .locator("option", { hasText: "年齡未標示" }),
  ).toHaveCount(0);
  await search.fill("範例");
  await search.press("Enter");
  await expect(page.getByRole("status")).toHaveText(range(1, 2, 2));
  await expect(cards).toHaveText(["範例親子公園", "範例探索館"]);
  await page.getByLabel("縣市", { exact: true }).selectOption("新北市");
  await page.getByLabel("類型", { exact: true }).selectOption("博物館");
  await page.getByLabel("環境", { exact: true }).selectOption("室內外皆有");
  await page.getByLabel("年齡帶", { exact: true }).selectOption("7–12 歲");
  await expect(page.getByRole("status")).toHaveText(range(1, 1, 1));
  await expect(cards).toHaveText(["範例探索館"]);
  await expect(
    page
      .getByText("新北市 板橋區 · 博物館 · 室內外皆有")
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText("3–12 歲", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await search.fill("summaryprobe");
  await search.press("Enter");
  await expect(cards).toHaveText(["範例探索館"]);
  await search.fill("zzzznomatchingplace");
  await search.press("Enter");
  await expect(
    page.getByText("沒有符合條件的景點，請調整搜尋文字或清除條件。"),
  ).toBeVisible();
  const reset = page.getByRole("button", { name: "清除條件" });
  await reset.focus();
  await page.keyboard.press("Enter");
  await expect(search).toHaveValue("");
  await expect(page.getByLabel("縣市", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("類型", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("環境", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("年齡帶", { exact: true })).toHaveValue("");
  await expect(cards).toHaveCount(PAGE_SIZE);
  await search.focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "搜尋", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#filter-options > summary")).toBeFocused();
  for (const label of ["縣市", "類型", "環境", "年齡帶"]) {
    await page.keyboard.press("Tab");
    await expect(page.getByLabel(label, { exact: true })).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: /^查看 .* 筆結果$/ }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "清除條件" })).toBeFocused();
  await page.getByLabel("縣市", { exact: true }).selectOption("臺北市");
  await expect(cards.filter({ hasText: "範例親子公園" })).toHaveCount(1);
  await expect(cards.filter({ hasText: "範例探索館" })).toHaveCount(0);
});

test("clearing an in-flight search prevents its late result from replacing the current filters", async ({
  page,
}) => {
  const index = hold(page, "**/pagefind/pagefind.js");
  // 景點對照表是舊請求最後才完成的一步：留到最後放行，才知道舊請求確實結束了
  const ids = hold(page, "**/pagefind/spot-ids.json");
  await page.goto("/");
  await page.getByRole("searchbox").fill("summaryprobe");
  await page.getByRole("searchbox").press("Enter");
  await index.requested;
  // 列表資料與索引的載入時間不定，狀態仍要確定地進入「搜尋中…」
  await expect(page.getByRole("status")).toHaveAttribute(
    "data-state",
    "loading",
  );
  await expect(page.locator(".spots")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("status")).toHaveText("搜尋中…");
  await page.getByRole("button", { name: "清除條件" }).click();
  await openFilters(page);
  await page.getByLabel("縣市", { exact: true }).selectOption("臺北市");
  await expect(page.getByRole("status")).toHaveText(RANGE_RESULT);
  index.release();
  const completed = page.waitForResponse(
    (response) =>
      response.url().endsWith("/pagefind/spot-ids.json") && response.ok(),
  );
  ids.release();
  await (await completed).finished();
  // 舊請求在對照表回來後才會收尾；等網路靜止再確認它沒有蓋掉目前的狀態
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("status")).toHaveText(RANGE_RESULT);
  await expect(page.locator(".spots")).toHaveAttribute("aria-busy", "false");
  // 遲到的 summaryprobe 結果只會是探索館；目前條件是臺北市
  const headings = page
    .getByRole("region", { name: /景點列表/ })
    .getByRole("heading", { level: 3 });
  await expect(headings.filter({ hasText: "範例親子公園" })).toHaveCount(1);
  await expect(headings.filter({ hasText: "範例探索館" })).toHaveCount(0);
});

test("search failure preserves browsing and clearing restores normal filtering", async ({
  page,
}) => {
  await page.route("**/pagefind/**", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("searchbox").fill("summaryprobe");
  await page.getByRole("searchbox").press("Enter");
  await expect(page.getByRole("status")).toContainText("搜尋暫時無法使用");
  await expect(page.getByRole("status")).toHaveAttribute("data-state", "error");
  await expect(
    page
      .getByRole("region", { name: /景點列表/ })
      .getByRole("heading", { level: 3 }),
  ).toHaveCount(PAGE_SIZE);
  // 搜尋失敗時，選項筆數只依篩選計算：不含文字命中，也不會變成 0
  await openFilters(page);
  const taipei = page
    .getByLabel("縣市", { exact: true })
    .locator("option", { hasText: /^臺北市（/ });
  const count = Number(/（([\d,]+)）/.exec((await taipei.textContent())!)![1]);
  expect(count).toBeGreaterThan(1);
  await page.getByLabel("縣市", { exact: true }).selectOption("臺北市");
  await expect(page.getByRole("status")).toContainText(`共 ${count} 筆`);
  await expect(page.getByRole("status")).toContainText("搜尋暫時無法使用");
  await page.getByRole("button", { name: "清除條件" }).click();
  await expect(page.getByRole("status")).toHaveText(RANGE_RESULT);
  await page.getByLabel("縣市", { exact: true }).selectOption("臺北市");
  await expect(page.getByRole("status")).toHaveText(RANGE_RESULT);
  await expect(
    page.getByRole("link", { name: "範例親子公園", exact: true }),
  ).toBeVisible();
});

test("without JavaScript the search and filter controls are absent and explained by one line", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect(page.locator("#spot-search")).toBeHidden();
    await expect(page.getByText("搜尋與篩選需要 JavaScript")).toBeVisible();
    await expect(page.getByText("仍可從下方瀏覽全部景點")).toHaveCount(0);
    await page.getByRole("link", { name: "範例探索館", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "範例探索館",
    );
  } finally {
    await context.close();
  }
});

for (const width of [360, 390, 430, 1366, 1920]) {
  test(`filtered and empty results remain accessible at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await openFilters(page);
    await page.getByLabel("類型", { exact: true }).selectOption("博物館");
    await expect(page.getByRole("status")).toHaveText(RANGE_RESULT);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("searchbox").fill("zzzznomatchingplace");
    await page.getByRole("searchbox").press("Enter");
    await expect(page.getByRole("status")).toHaveText("沒有符合條件的景點");
    await expect(
      page.getByText("沒有符合條件的景點，請調整搜尋文字或清除條件。"),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
