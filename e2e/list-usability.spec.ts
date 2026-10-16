import { test, expect } from "@playwright/test";
import { PAGE_SIZE, RANGE_RESULT, TOTAL_SPOTS, range } from "./fixture.ts";

const cards = (page: import("@playwright/test").Page) =>
  page.getByRole("region", { name: /景點列表/ }).locator(".spots > li");
const filters = (page: import("@playwright/test").Page) =>
  page.locator("#filter-options");

test("filter controls start collapsed and remain keyboard operable on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(filters(page)).not.toHaveAttribute("open", "");
  const summary = filters(page).locator("summary");
  await expect(summary).toContainText("篩選條件");
  await expect(page.getByRole("searchbox", { name: "搜尋景點" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "搜尋", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "清除條件" })).toBeVisible();
  await expect(page.getByLabel("縣市", { exact: true })).toBeHidden();
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(filters(page)).toHaveAttribute("open", "");
  await expect(page.getByLabel("縣市", { exact: true })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("縣市", { exact: true })).toBeFocused();
  await summary.focus();
  await page.keyboard.press("Space");
  await expect(filters(page)).not.toHaveAttribute("open", "");
});

test("@smoke URL restores validated filters on load and reload", async ({
  page,
}) => {
  await page.goto(
    "/?query=summaryprobe&county=%E6%96%B0%E5%8C%97%E5%B8%82&kind=%E5%8D%9A%E7%89%A9%E9%A4%A8&setting=%E5%AE%A4%E5%85%A7%E5%A4%96%E7%9A%86%E6%9C%89&age=7%E2%80%9312+%E6%AD%B2",
  );
  await expect(page.getByRole("searchbox")).toHaveValue("summaryprobe");
  await expect(page.getByRole("status")).toHaveText(range(1, 1, 1));
  await expect(cards(page).filter({ visible: true })).toHaveCount(1);
  await expect(cards(page).filter({ visible: true }).first()).toContainText(
    "範例探索館",
  );
  await filters(page).locator("summary").click();
  for (const [label, value] of [
    ["縣市", "新北市"],
    ["類型", "博物館"],
    ["環境", "室內外皆有"],
    ["年齡帶", "7–12 歲"],
  ] as const)
    await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
  await page.reload();
  await expect(page.getByRole("searchbox")).toHaveValue("summaryprobe");
  await expect(page.getByRole("status")).toHaveText(range(1, 1, 1));
  await expect(cards(page).filter({ visible: true }).first()).toContainText(
    "範例探索館",
  );
});

test("@smoke removing one active filter keeps the others and updates the URL", async ({
  page,
}) => {
  await page.goto("/");
  const historyLength = await page.evaluate(() => history.length);
  await filters(page).locator("summary").click();
  await page.getByRole("searchbox").fill("範例");
  await page.getByRole("searchbox").press("Enter");
  await expect(page.getByRole("status")).toHaveText(range(1, 2, 2));
  await page.getByLabel("縣市", { exact: true }).selectOption("新北市");
  await page.getByLabel("類型", { exact: true }).selectOption("博物館");
  await expect(page.getByRole("status")).toHaveText(range(1, 1, 1));
  await page.getByRole("button", { name: "移除縣市：新北市" }).click();
  await expect(page.getByLabel("縣市", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("類型", { exact: true })).toHaveValue("博物館");
  await expect(page.getByRole("searchbox")).toHaveValue("範例");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("county"))
    .toBeNull();
  expect(new URL(page.url()).searchParams.get("kind")).toBe("博物館");
  expect(new URL(page.url()).searchParams.get("query")).toBe("範例");
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await page.getByRole("button", { name: "移除搜尋：範例" }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page.getByLabel("類型", { exact: true })).toHaveValue("博物館");
  await expect(page.getByRole("status")).toHaveText(RANGE_RESULT);
});

test("@smoke invalid URL values are ignored and empty results recover", async ({
  page,
}) => {
  await page.goto(
    "/?county=unknown&kind=invalid&setting=invalid&age=invalid&query=nomatchingplace",
  );
  await expect(page.getByRole("status")).toHaveText("沒有符合條件的景點");
  await filters(page).locator("summary").click();
  for (const label of ["縣市", "類型", "環境", "年齡帶"])
    await expect(page.getByLabel(label, { exact: true })).toHaveValue("");
  await expect(
    page.getByRole("button", { name: /移除縣市|移除類型|移除環境|移除年齡/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "重新瀏覽全部景點" }).click();
  await expect(page.getByRole("status")).toHaveText(
    range(1, PAGE_SIZE, TOTAL_SPOTS),
  );
  await expect(cards(page).filter({ visible: true })).toHaveCount(PAGE_SIZE);
  await expect(page).toHaveURL(/\/$/);
});

test("browser Back restores filter state after opening a spot", async ({
  page,
}) => {
  // 以「範例」限縮到手寫的兩筆，避免產生景點干擾單筆結果的斷言
  await page.goto("/?query=%E7%AF%84%E4%BE%8B");
  await filters(page).locator("summary").click();
  await page.getByLabel("類型", { exact: true }).selectOption("博物館");
  await expect(page.getByRole("status")).toHaveText(range(1, 1, 1));
  await page
    .getByRole("link", { name: "範例探索館", exact: true })
    .scrollIntoViewIfNeeded();
  await page.getByRole("link", { name: "範例探索館", exact: true }).click();
  await expect(page).toHaveURL(/\/spots\/example-museum\/$/);
  await page.goBack();
  await expect(filters(page)).toHaveAttribute("open", "");
  await expect(page.getByLabel("類型", { exact: true })).toHaveValue("博物館");
  await expect(page.getByRole("status")).toHaveText(range(1, 1, 1));
  await expect(cards(page).filter({ visible: true }).first()).toContainText(
    "範例探索館",
  );
  const storedScroll = await page.evaluate(
    () => history.state?.carlTravelList?.scrollY as number,
  );
  expect(storedScroll).toBeGreaterThan(0);
  await expect
    .poll(async () =>
      Math.abs((await page.evaluate(() => scrollY)) - storedScroll),
    )
    .toBeLessThan(10);
  await expect(
    page.getByRole("link", { name: "範例探索館", exact: true }),
  ).toBeFocused();
});

test("@smoke cards list only known conditions and collapse unknowns into one line", async ({
  page,
}) => {
  await page.goto("/");
  const park = cards(page).filter({ hasText: "範例親子公園" });
  const museum = cards(page).filter({ hasText: "範例探索館" });
  await expect(park.locator(".card-tags")).toHaveCount(0);
  await expect(park.locator(".card-note")).toHaveText(
    "親子條件與年齡尚未整理，未知不代表沒有",
  );
  await expect(park).not.toContainText("查證");
  await expect(
    page.getByRole("link", { name: "查看親子條件與出處" }),
  ).toHaveCount(0);
  await expect(museum.locator(".card-tags li")).toHaveText([
    "3–12 歲",
    "推車友善：有",
    "哺乳室：沒有",
    "雨天備案：有",
  ]);
  await expect(museum.locator(".card-tags li[data-negative]")).toHaveText([
    "哺乳室：沒有",
  ]);
  await expect(museum.locator(".card-note")).toHaveText(
    "另有 2 項親子條件未知 · 查證 2020-01-01",
  );
  await expect(museum).not.toContainText("↗");
  await expect(cards(page).locator("a:has-text('↗')")).toHaveCount(0);
});

test("unillustrated cards are plain text and illustrated ones show a 72x48 thumbnail", async ({
  page,
}) => {
  await page.goto("/");
  const park = cards(page).filter({ hasText: "範例親子公園" });
  await expect(park.locator("img")).toHaveCount(0);
  const summary = (await park.locator(".spot-summary").boundingBox())!;
  const article = (await park.locator("article").boundingBox())!;
  expect(summary.x - article.x).toBeLessThan(2);
  // 前 24 筆沒有插畫，帶插畫的景點在後面的頁
  await page.goto("/page/3/");
  const illustrated = cards(page).filter({ has: page.locator("img") });
  expect(await illustrated.count()).toBeGreaterThan(0);
  const box = (await illustrated.first().locator("img").boundingBox())!;
  expect(Math.round(box.width)).toBe(72);
  expect(Math.round(box.height)).toBe(48);
});

test("each card is one tab stop and the whole card is clickable", async ({
  page,
}) => {
  await page.goto("/");
  const stops = await cards(page).evaluateAll((items) =>
    items.map(
      (item) =>
        item.querySelectorAll(
          'a[href], button, input, select, summary, [tabindex]:not([tabindex="-1"])',
        ).length,
    ),
  );
  expect(stops).toHaveLength(PAGE_SIZE);
  expect(stops.every((count) => count === 1)).toBe(true);

  const museum = cards(page).filter({ hasText: "範例探索館" });
  const link = museum.getByRole("link", { name: "範例探索館", exact: true });
  await link.focus();
  await page.keyboard.press("Tab");
  await expect(link).not.toBeFocused();
  await link.focus();
  const outline = await museum.evaluate(
    (item) => getComputedStyle(item).outlineStyle,
  );
  expect(outline).toBe("solid");

  await museum.scrollIntoViewIfNeeded();
  const box = (await museum.boundingBox())!;
  await page.mouse.click(box.x + box.width - 12, box.y + box.height - 12);
  await expect(page).toHaveURL(/\/spots\/example-museum\/$/);
});

test("selected-condition chips are at least 44px tall and 15px", async ({
  page,
}) => {
  await page.goto("/");
  await filters(page).locator("summary").click();
  await page.getByLabel("縣市", { exact: true }).selectOption("新北市");
  const chip = page.getByRole("button", { name: "移除縣市：新北市" });
  const box = (await chip.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(await chip.evaluate((el) => getComputedStyle(el).fontSize)).toBe(
    "15px",
  );
});
