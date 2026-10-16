import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const museum = "/spots/example-museum/";
// 全未知的產生景點（見 docs/development.md 的形態說明）
const allUnknown = "/spots/fx-00001/";

test("@smoke card rows and anchors open the target section and focus its summary", async ({
  page,
}) => {
  await page.goto(museum);
  await expect(page.locator("details[open]")).toHaveCount(1);
  await page.getByRole("link", { name: /^開放時間/ }).click();
  await expect(page.locator("#hours")).toHaveAttribute("open", "");
  await expect(page.locator("#hours > summary")).toBeFocused();
  await expect(page).toHaveURL(/#hours$/);
  // 錨點進站
  await page.goto("/");
  await page.goto(`${museum}#tips`);
  await expect(page.locator("#tips")).toHaveAttribute("open", "");
  await expect(page.locator("#tips > summary")).toBeFocused();
  await expect(page.locator("#tips > summary")).toBeInViewport();
});

test("every pre-departure row is a 48px link that opens its section and focuses the summary", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(museum);
  const rows = page.locator(".rows a");
  await expect(rows).toHaveCount(6);
  const targets = await rows.evaluateAll((links) =>
    links.map((link) => (link as HTMLAnchorElement).hash.slice(1)),
  );
  expect(targets).toEqual([
    "references",
    "hours",
    "hours",
    "hours",
    "checklist",
    "checklist",
  ]);
  for (let i = 0; i < targets.length; i++) {
    await page.goto("/");
    await page.goto(museum);
    const row = page.locator(".rows a").nth(i);
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await row.click();
    const section = page.locator(`#${targets[i]}`);
    await expect(section).toHaveAttribute("open", "");
    await expect(section.locator("> summary")).toBeFocused();
    await expect(section.locator("> summary")).toBeInViewport();
  }
});

test("every section opens and focuses its summary when entered by anchor", async ({
  page,
}) => {
  await page.goto(museum);
  const ids = await page
    .locator("details")
    .evaluateAll((all) => all.map((d) => d.id));
  expect(ids).toHaveLength(9);
  for (const id of ids) {
    await page.goto("/");
    await page.goto(`${museum}#${id}`);
    await expect(page.locator(`#${id}`)).toHaveAttribute("open", "");
    await expect(page.locator(`#${id} > summary`)).toBeFocused();
  }
});

test("status and conflict rows are emphasised; absent status never reads as normal operation", async ({
  page,
}) => {
  await page.goto(museum);
  const strong = page.locator(".rows a.strong");
  await expect(strong).toHaveCount(1);
  await expect(strong).toContainText("資訊衝突");
  await expect(strong).toHaveCSS("background-color", "rgb(24, 62, 81)");
  await expect(page.locator(".rows a").first()).toHaveText(
    /營運狀態\s*未記錄異動，出發前請看官方公告/,
  );
  // 休園降級的地圖文字連結只在有結構化休園狀態時出現，目前沒有資料
  await expect(page.getByText("目前休園，仍要查看位置")).toHaveCount(0);
});

test("h1 and the pre-departure card are in the first viewport at 390px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [museum, allUnknown]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport({
      ratio: 1,
    });
    await expect(
      page.getByRole("heading", { level: 2, name: "出發前確認" }),
    ).toBeInViewport();
  }
});

test("all-unknown spot never reads unknown as absent", async ({ page }) => {
  await page.goto(allUnknown);
  const rows = page.locator(".rows a");
  await expect(rows).toHaveText([
    /營運狀態\s*未記錄異動，出發前請看官方公告/,
    /開放時間/,
    /費用\s*尚未整理，未列出不代表免費/,
    /親子條件\s*尚未整理（未知不代表沒有）/,
    /建議年齡\s*未標示/,
  ]);
  const checklist = page.locator("#checklist");
  await expect(checklist).toHaveAttribute("open", "");
  await expect(checklist).toContainText(
    "親子條件與年齡尚未整理。未知不代表沒有。",
  );
  await expect(checklist).toContainText("出發前可向 虛構資料提供機關");
  await expect(checklist.locator("dl")).toHaveCount(0);
  await expect(page.locator("[data-status]")).toHaveCount(0);
  // 資料沒有的章節：不能展開的「尚未整理」
  await expect(page.locator(".acc-missing")).toHaveText([
    "設施　尚未整理",
    "跟孩子一起看　尚未整理",
  ]);
  await expect(page.locator("#facilities, #with-kids")).toHaveCount(0);
  await expect(page.locator("#hours > summary")).toContainText("費用尚未整理");
});

test("without JavaScript the folding rows still expand", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const base = test.info().project.use.baseURL!;
  await page.goto(new URL(museum, base).href);
  const hours = page.locator("#hours");
  await expect(hours).not.toHaveAttribute("open", /.*/);
  await expect(hours.getByText("上午九點至下午五點。")).toBeHidden();
  await hours.locator("summary").click();
  await expect(hours).toHaveAttribute("open", "");
  await expect(hours.getByText("上午九點至下午五點。")).toBeVisible();
  await context.close();
});

test("collapsed section content is found by a real Pagefind query", async ({
  page,
}) => {
  await page.goto(museum);
  // 這些詞都在收合中的章節裡
  const terms = {
    tipprobe: "#tips",
    paraphraseprobe: "#author",
    learningprobe: "#with-kids",
    activityprobe: "#with-kids",
  };
  for (const [term, section] of Object.entries(terms)) {
    await expect(page.locator(`${section}:not([open])`)).toHaveCount(1);
    await expect(page.locator(section)).toContainText(term);
    const urls = await page.evaluate(async (query) => {
      const path = "/pagefind/pagefind.js";
      const pagefind = await import(path);
      const result = await pagefind.search(query);
      return Promise.all(
        result.results.map(
          async (hit: { data(): Promise<{ url: string }> }) =>
            (await hit.data()).url,
        ),
      );
    }, term);
    expect(urls, term).toEqual([museum]);
  }
});

for (const width of [360, 390, 430, 1366, 1920]) {
  test(`expanded spot page has no axe violations at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(museum);
    for (const summary of await page.locator("details > summary").all())
      if (
        !(await summary.evaluate(
          (el) => (el.parentElement as HTMLDetailsElement).open,
        ))
      )
        await summary.click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
