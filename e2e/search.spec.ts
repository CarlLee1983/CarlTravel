import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PAGE_SIZE, RANGE_RESULT, TOTAL_SPOTS, range } from "./fixture.ts";

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
  // 產生景點的虛構文字可能與排除詞共用單字；只要求手寫案例沒有被索引到
  for (const term of excluded)
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
  ).toContainText(["全部年齡", "3–6 歲", "7–12 歲", "年齡未標示"]);
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
  await page.getByLabel("年齡帶", { exact: true }).selectOption("年齡未標示");
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
  await expect(page.getByRole("button", { name: "清除條件" })).toBeFocused();
  await page.getByLabel("縣市", { exact: true }).selectOption("臺北市");
  await expect(cards.filter({ hasText: "範例親子公園" })).toHaveCount(1);
  await expect(cards.filter({ hasText: "範例探索館" })).toHaveCount(0);
});

test("clearing an in-flight search prevents its late result from replacing the current filters", async ({
  page,
}) => {
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route("**/pagefind/pagefind.js", async (route) => {
    started();
    await held;
    await route.continue();
  });
  await page.goto("/");
  await page.getByRole("searchbox").fill("summaryprobe");
  await page.getByRole("searchbox").press("Enter");
  await requested;
  await expect(page.getByRole("status")).toHaveAttribute(
    "data-state",
    "loading",
  );
  await expect(page.locator(".spots")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("status")).toHaveText("搜尋中…");
  await page.getByRole("button", { name: "清除條件" }).click();
  await openFilters(page);
  await page.getByLabel("縣市", { exact: true }).selectOption("臺北市");
  const completed = page.waitForResponse(
    (response) =>
      response.url().includes("/pagefind/fragment/") && response.ok(),
  );
  release();
  await (await completed).finished();
  // The old request must finish before checking it did not overwrite the cleared state.
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
  await page.getByRole("button", { name: "清除條件" }).click();
  await openFilters(page);
  await page.getByLabel("年齡帶", { exact: true }).selectOption("年齡未標示");
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

test("empty-results recovery resets query and filters together", async ({
  page,
}) => {
  await page.goto("/");
  await openFilters(page);
  await page.getByRole("searchbox").fill("zzzznomatchingplace");
  await page.getByRole("searchbox").press("Enter");
  await page.getByLabel("縣市", { exact: true }).selectOption("新北市");
  await page.getByLabel("類型", { exact: true }).selectOption("公園");
  const recovery = page.getByRole("button", { name: "重新瀏覽全部景點" });
  await expect(recovery).toBeVisible();
  await recovery.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("searchbox")).toBeFocused();
  await expect(page.getByRole("status")).toHaveText(
    range(1, PAGE_SIZE, TOTAL_SPOTS),
  );
  await expect(page.getByRole("status")).toHaveAttribute("data-state", "ready");
  await expect(page.getByLabel("縣市", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("類型", { exact: true })).toHaveValue("");
  await expect(recovery).toBeHidden();
});
