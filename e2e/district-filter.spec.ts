import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { RANGE_RESULT, TOTAL_SPOTS, range } from "./fixture.ts";

const select = (page: Page, label: string) =>
  page.getByLabel(label, { exact: true });
const openFilters = (page: Page) =>
  page.locator("#filter-options > summary").click();
const optionTexts = (page: Page, label: string) =>
  select(page, label).locator("option").allTextContents();
// 「高雄市（8）」→ 8
const countOf = (text: string) =>
  Number(/（([\d,]+)）$/.exec(text)![1]!.replace(/,/g, ""));
// 篩選變更後範圍文字會先經過「載入中」「搜尋中…」；讀到過渡文字時回傳 NaN，讓 expect.poll 重試
const total = async (page: Page) => {
  const text = await page.getByRole("status").textContent();
  const match = /共 ([\d,]+) 筆/.exec(text ?? "");
  return match ? Number(match[1]!.replace(/,/g, "")) : NaN;
};
const params = (page: Page) => new URL(page.url()).searchParams;

test("@smoke the district select appears under a county and is cleared when the county changes", async ({
  page,
}) => {
  await page.goto("/");
  await openFilters(page);
  await expect(select(page, "縣市")).toBeVisible();
  await expect(select(page, "行政區")).toBeHidden();

  await select(page, "縣市").selectOption("高雄市");
  await expect(select(page, "行政區")).toBeVisible();
  const districts = await optionTexts(page, "行政區");
  expect(districts[0]).toBe("全部行政區");
  // 只列該縣市有景點的行政區，且每個都帶筆數
  expect(districts).toContain("鹽埕區（1）");
  expect(districts.some((text) => text.startsWith("中區"))).toBe(false);
  for (const text of districts.slice(1)) expect(text).toMatch(/（\d+）$/);

  await select(page, "行政區").selectOption("鹽埕區");
  await expect(page.getByRole("status")).toHaveText(range(1, 1, 1));
  expect(params(page).get("county")).toBe("高雄市");
  expect(params(page).get("district")).toBe("鹽埕區");
  await expect(
    page.getByRole("button", { name: "移除行政區：鹽埕區" }),
  ).toBeVisible();

  await select(page, "縣市").selectOption("臺中市");
  await expect(select(page, "行政區")).toHaveValue("");
  await expect(select(page, "行政區")).toBeVisible();
  await expect.poll(() => params(page).get("district")).toBeNull();
  expect(params(page).get("county")).toBe("臺中市");
  expect(await optionTexts(page, "行政區")).toContain("中區（2）");
  await expect(page.getByRole("button", { name: /移除行政區/ })).toHaveCount(0);

  // 清掉縣市，行政區跟著收起來
  await select(page, "行政區").selectOption("東區");
  await page.getByRole("button", { name: "移除縣市：臺中市" }).click();
  await expect(select(page, "縣市")).toHaveValue("");
  await expect(select(page, "行政區")).toBeHidden();
  await expect.poll(() => params(page).get("district")).toBeNull();
  await expect(page.getByRole("status")).toHaveText(range(1, 24, TOTAL_SPOTS));
});

test("a district that does not match the county is ignored and the URL is corrected", async ({
  page,
}) => {
  await page.goto(
    "/?county=%E9%AB%98%E9%9B%84%E5%B8%82&district=%E4%B8%AD%E5%8D%80",
  );
  // 靜態第 1 頁的範圍文字也符合 RANGE_RESULT，要等到篩選套用後（筆數少於全部）才算數
  await expect.poll(() => total(page)).toBeLessThan(TOTAL_SPOTS);
  const kaohsiung = await total(page);
  await expect.poll(() => params(page).get("district")).toBeNull();
  expect(params(page).get("county")).toBe("高雄市");
  await openFilters(page);
  await expect(select(page, "縣市")).toHaveValue("高雄市");
  await expect(select(page, "行政區")).toHaveValue("");
  await expect(page.getByRole("button", { name: /移除行政區/ })).toHaveCount(0);

  // 只有行政區、沒有縣市：整個忽略
  await page.goto("/?district=%E9%B9%BD%E5%9F%95%E5%8D%80");
  await expect(page.getByRole("status")).toHaveText(range(1, 24, TOTAL_SPOTS));
  await expect.poll(() => new URL(page.url()).search).toBe("");
  expect(kaohsiung).toBeLessThan(TOTAL_SPOTS);

  // 符合縣市的行政區照常套用
  await page.goto(
    "/?county=%E9%AB%98%E9%9B%84%E5%B8%82&district=%E9%B9%BD%E5%9F%95%E5%8D%80",
  );
  await expect(page.getByRole("status")).toHaveText(range(1, 1, 1));
  expect(params(page).get("district")).toBe("鹽埕區");
  await openFilters(page);
  await expect(select(page, "行政區")).toHaveValue("鹽埕區");
});

test("every option shows how many results remain, and the count matches the result", async ({
  page,
}) => {
  await page.goto("/");
  await openFilters(page);
  await expect(
    select(page, "縣市")
      .locator("option", { hasText: /（\d+）$/ })
      .first(),
  ).toBeAttached();
  const counties = (await optionTexts(page, "縣市")).slice(1);
  expect(counties.length).toBeGreaterThan(2);
  // 沒有條件時，各縣市筆數加總等於全部景點
  expect(counties.reduce((sum, text) => sum + countOf(text), 0)).toBe(
    TOTAL_SPOTS,
  );
  const kaohsiung = counties.find((text) => text.startsWith("高雄市"))!;
  await select(page, "縣市").selectOption("高雄市");
  await expect.poll(() => total(page)).toBe(countOf(kaohsiung));
  // 已選條件會改變其他維度的筆數
  const kinds = (await optionTexts(page, "類型")).slice(1);
  expect(kinds.reduce((sum, text) => sum + countOf(text), 0)).toBe(
    countOf(kaohsiung),
  );
});

test("@smoke options with zero results are disabled, and text hits update the counts", async ({
  page,
}) => {
  await page.goto("/");
  await openFilters(page);
  await page.getByRole("searchbox").fill("範例");
  await page.getByRole("searchbox").press("Enter");
  await expect(page.getByRole("status")).toHaveText(range(1, 2, 2));
  const county = select(page, "縣市");
  await expect(county.locator("option", { hasText: /^臺北市/ })).toHaveText(
    "臺北市（1）",
  );
  await expect(county.locator("option", { hasText: /^新北市/ })).toHaveText(
    "新北市（1）",
  );
  const empty = county.locator("option", { hasText: /^高雄市/ });
  await expect(empty).toHaveText("高雄市（0）");
  await expect(empty).toBeDisabled();
  await expect(county.locator("option", { hasText: /^新北市/ })).toBeEnabled();
  // 停用的選項選不到
  await expect(
    county.selectOption("高雄市", { timeout: 1500 }),
  ).rejects.toThrow();
  await expect(county).toHaveValue("");

  // 已選的選項不因為變成 0 筆而停用
  await county.selectOption("新北市");
  await page.getByRole("searchbox").fill("zzzznomatchingplace");
  await page.getByRole("searchbox").press("Enter");
  await expect(page.getByRole("status")).toHaveText("沒有符合條件的景點");
  const selected = county.locator("option", { hasText: /^新北市/ });
  await expect(selected).toHaveText("新北市（0）");
  await expect(selected).toBeEnabled();
  await expect(county).toHaveValue("新北市");
  await expect(county.locator("option", { hasText: /^臺北市/ })).toBeDisabled();
});

for (const width of [360, 390, 430, 1366, 1920]) {
  test(`two-tier filters remain accessible at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/?county=%E9%AB%98%E9%9B%84%E5%B8%82");
    await expect(page.getByRole("status")).toHaveText(RANGE_RESULT);
    await openFilters(page);
    await expect(select(page, "行政區")).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
