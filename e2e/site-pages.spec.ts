import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const license = "https://creativecommons.org/licenses/by-nc/4.0/";

test("readers can find the content license and disclaimer from every page", async ({
  page,
}) => {
  for (const route of [
    "/",
    "/spots/example-museum/",
    "/about/",
    "/does-not-exist/",
  ]) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(route === "/does-not-exist/" ? 404 : 200);
    await expect(page.locator('head link[rel="license"]')).toHaveAttribute(
      "href",
      license,
    );
    const footer = page.getByRole("contentinfo");
    await expect(
      footer.getByRole("link", { name: /CC BY-NC 4.0/ }),
    ).toHaveAttribute("href", "/about/#license");
    await footer.getByRole("link", { name: "完整免責聲明" }).click();
    await expect(page).toHaveURL(/\/about\/#disclaimer$/);
    await expect(
      page.getByRole("heading", { name: "使用資訊前，請再確認" }),
    ).toBeInViewport();
    await expect(page.getByText(/未知不代表沒有/)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "CC BY-NC 4.0 授權條款" }),
    ).toHaveAttribute("href", license);
    await page
      .getByRole("navigation", { name: "站內導覽" })
      .getByRole("link", { name: "景點索引" })
      .click();
    await expect(page).toHaveURL(/\/$/);
  }
});

test("spot contents links match existing sections and work with the keyboard on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const [route, labels] of [
    [
      "/spots/example-park/",
      [
        "親子清單",
        "開放時間與費用",
        "交通與停車",
        "來源與官方出處",
        "免責聲明",
      ],
    ],
    [
      "/spots/example-museum/",
      [
        "親子清單",
        "開放時間與費用",
        "交通與停車",
        "設施",
        "跟孩子一起看",
        "原作者心得",
        "Agent 建議",
        "周邊安排",
        "來源與官方出處",
        "免責聲明",
      ],
    ],
  ] as const) {
    await page.goto(route);
    const contents = page.getByRole("navigation", { name: "景點章節目錄" });
    await expect(contents.getByRole("link")).toHaveText([...labels]);
    for (const link of await contents.getByRole("link").all()) {
      const href = await link.getAttribute("href");
      expect(href).toMatch(/^#/);
      await expect(page.locator(href!)).toHaveCount(1);
    }
    await contents.getByRole("link").first().focus();
    for (let i = 1; i < labels.length; i++) await page.keyboard.press("Tab");
    await expect(contents.getByRole("link").last()).toBeFocused();
    await expect(contents.getByRole("link").last()).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.locator("#spot-disclaimer")).toBeInViewport();
    await expect(page.locator("#spot-disclaimer")).toBeFocused();
    await page.getByRole("link", { name: "閱讀完整免責聲明" }).click();
    await expect(page).toHaveURL(/\/about\/#disclaimer$/);
  }
});

test("compact home shows its browsing scope beside the list on desktop and above it on mobile", async ({
  page,
}) => {
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const browsing = page.getByRole("complementary", { name: "搜尋與篩選" });
    const results = page.getByRole("region", { name: /景點列表/ });
    await expect(
      browsing.getByText("搜尋與篩選尚未開放，目前可瀏覽全部景點。"),
    ).toBeVisible();
    await expect(browsing.getByRole("textbox")).toHaveCount(0);
    await expect(browsing.getByRole("combobox")).toHaveCount(0);
    await expect(results.getByRole("heading", { level: 3 })).toHaveText([
      "範例親子公園",
      "範例探索館",
    ]);
    const sidebar = (await browsing.boundingBox())!;
    const list = (await results.boundingBox())!;
    if (width > 900)
      expect(sidebar.x + sidebar.width).toBeLessThanOrEqual(list.x);
    else expect(sidebar.y + sidebar.height).toBeLessThanOrEqual(list.y);
  }
});

for (const route of [
  "/",
  "/spots/example-park/",
  "/spots/example-museum/",
  "/about/",
  "/does-not-exist/",
]) {
  for (const width of [360, 390, 430, 1366, 1920]) {
    test(`accessible without horizontal overflow ${route} at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  }
}

test("fixture sitemap is valid XML and exposes no test pages", async ({
  page,
}) => {
  const response = await page.goto("/sitemap.xml");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-type"]).toMatch(/xml/);
  expect(
    await page.evaluate(() => {
      const xml = new DOMParser().parseFromString(
        document.documentElement.outerHTML,
        "application/xml",
      );
      return {
        errors: xml.querySelectorAll("parsererror").length,
        urls: xml.querySelectorAll("loc").length,
      };
    }),
  ).toEqual({ errors: 0, urls: 0 });
});
