import { test, expect } from "@playwright/test";
import {
  OUTDOOR_SPOTS,
  PAGE_SIZE,
  range,
  rangeText,
  spotCards,
} from "./fixture.ts";

const back = (page: import("@playwright/test").Page) =>
  page.locator("a[data-list-return]");
const openFirstCard = async (page: import("@playwright/test").Page) => {
  await spotCards(page).first().locator("h3 a").click();
  await expect(page).toHaveURL(/\/spots\//);
};

test("@smoke a spot opened from /page/2/ returns to that page", async ({
  page,
}) => {
  await page.goto("/page/2/");
  await openFirstCard(page);
  await expect(back(page)).toHaveText("← 回到剛才的列表");
  await expect(back(page)).toHaveAttribute("href", "/page/2/");
  await back(page).click();
  await expect(page).toHaveURL(/\/page\/2\/$/);
  await expect(rangeText(page)).toHaveText(range(25, 48, 62));
});

test("a spot opened from a filtered page 2 returns with conditions and page", async ({
  page,
}) => {
  await page.goto("/?setting=%E6%88%B6%E5%A4%96&page=2");
  await expect(rangeText(page)).toHaveText(
    range(PAGE_SIZE + 1, OUTDOOR_SPOTS, OUTDOOR_SPOTS),
  );
  await openFirstCard(page);
  await expect(back(page)).toHaveText("← 回到剛才的列表");
  await expect(back(page)).toHaveAttribute(
    "href",
    "/?setting=%E6%88%B6%E5%A4%96&page=2",
  );
  await back(page).click();
  await expect(page).toHaveURL(/\/\?setting=%E6%88%B6%E5%A4%96&page=2$/);
  await expect(rangeText(page)).toHaveText(
    range(PAGE_SIZE + 1, OUTDOOR_SPOTS, OUTDOOR_SPOTS),
  );
});

test("the return entry survives a reload and a section anchor", async ({
  page,
}) => {
  await page.goto("/page/2/");
  await openFirstCard(page);
  await page.reload();
  await expect(back(page)).toHaveAttribute("href", "/page/2/");
  await page.locator(".rows a").first().click();
  await back(page).click();
  await expect(page).toHaveURL(/\/page\/2\/$/);
});

test("a spot opened directly links to /", async ({ page }) => {
  await page.goto("/spots/example-museum/");
  await expect(back(page)).toHaveText("← 景點列表");
  await expect(back(page)).toHaveAttribute("href", "/");
  await back(page).click();
  await expect(page).toHaveURL(/\/$/);
});

test("a spot reached from a non-list page links to /", async ({ page }) => {
  await page.goto("/about/");
  await page.goto("/spots/example-museum/", { referer: page.url() });
  await expect(back(page)).toHaveAttribute("href", "/");
});

test("the header list link always goes to /", async ({ page }) => {
  await page.goto("/page/2/");
  await openFirstCard(page);
  await expect(
    page.getByRole("banner").getByRole("link", { name: "景點列表" }),
  ).toHaveAttribute("href", "/");
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("the entry links to / with the direct-entry label", async ({ page }) => {
    await page.goto("/page/2/");
    await page.locator(".results .spots > li h3 a").first().click();
    await expect(back(page)).toHaveText("← 景點列表");
    await expect(back(page)).toHaveAttribute("href", "/");
  });
});
