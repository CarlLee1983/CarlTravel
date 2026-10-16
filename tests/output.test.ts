import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  copyFile,
  symlink,
  readFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkOutput } from "../scripts/check-output.ts";
import { budget } from "../scripts/output-budget.ts";
import { encodeList } from "../src/content/list.ts";
import { loadSpots } from "../src/content/load.ts";
import {
  FIXTURE_COUNT,
  FIXTURE_SEED,
  describeSpots,
} from "../scripts/scale/generate-spots.ts";

// 列表 JSON 寫在與建置相同的 spot-list/ 下；rows 預設為零筆
async function writeList(output: string, content?: string, name = "list.json") {
  const spots = content ? await loadSpots(content) : [];
  await mkdir(join(output, "spot-list"), { recursive: true });
  await writeFile(
    join(output, "spot-list", name),
    JSON.stringify(encodeList(spots)),
  );
}

// 正式景點取自 fixture 的 YAML，但名稱改掉，才不會被洩漏檢查當成 fixture 名稱
async function copyApproved(content: string) {
  const source = await readFile(
    "tests/fixtures/spots/example-park/spot.yaml",
    "utf8",
  );
  await writeFile(
    join(content, "approved-park", "spot.yaml"),
    source.replace("範例親子公園", "核准公園"),
  );
}

// ids：命中 id → 景點 id 對照表的景點；預設只有 count 為 1 時對應核准的測試景點
async function writeSearchEntry(
  output: string,
  count = 0,
  ids = count === 1 ? ["approved-park"] : [],
) {
  await writeList(output);
  await mkdir(join(output, "pagefind"), { recursive: true });
  await writeFile(
    join(output, "pagefind", "pagefind-entry.json"),
    JSON.stringify({ languages: { "zh-Hant": { page_count: count } } }),
  );
  await writeFile(join(output, "pagefind", "pagefind.js"), "export {}; ");
  await writeFile(
    join(output, "pagefind", "spot-ids.json"),
    JSON.stringify(Object.fromEntries(ids.map((id) => [`zh-Hant_${id}`, id]))),
  );
}

async function writeBasicPages(output: string) {
  await writeSearchEntry(output);
  await mkdir(join(output, "about"), { recursive: true });
  for (const page of ["about/index.html", "404.html"])
    await writeFile(join(output, page), "<html><main>基本頁面</main></html>");
  await writeFile(
    join(output, "sitemap.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://carltravel.gravito.dev/</loc></url><url><loc>https://carltravel.gravito.dev/about/</loc></url></urlset>',
  );
}

test("output gate requires built pages and rejects fixture leakage", async () => {
  const root = await mkdtemp(join(tmpdir(), "carltravel-output-"));
  const output = join(root, "dist");
  const content = join(root, "content");
  try {
    await mkdir(content);
    await assert.rejects(checkOutput(output, content), /ENOENT/);
    await mkdir(output);
    await writeFile(join(output, "index.html"), "");
    await assert.rejects(checkOutput(output, content), /missing HTML/);
    await writeFile(
      join(output, "index.html"),
      "<html><main>目前尚無公開景點</main></html>",
    );
    await writeBasicPages(output);
    assert.equal(await checkOutput(output, content), 0);
    await writeFile(
      join(output, "index.html"),
      "<html><main>範例親子公園</main></html>",
    );
    await assert.rejects(checkOutput(output, content), /fixture marker/);
    await writeFile(
      join(output, "index.html"),
      "<html><main>景點</main></html>",
    );
    await mkdir(join(output, "spots", "unexpected"), { recursive: true });
    await assert.rejects(checkOutput(output, content), /differ/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("output gate rejects names from the generated e2e fixture", async () => {
  const root = await mkdtemp(join(tmpdir(), "carltravel-generated-"));
  const content = join(root, "content");
  try {
    await mkdir(content);
    await writeFile(
      join(root, "index.html"),
      `<html><main>${describeSpots({ seed: FIXTURE_SEED, count: FIXTURE_COUNT })[7]!.spot.name}</main></html>`,
    );
    await writeBasicPages(root);
    await assert.rejects(checkOutput(root, content), /fixture marker/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("matching spot directory without page is not a successful build", async () => {
  const root = await mkdtemp(join(tmpdir(), "carltravel-page-"));
  try {
    await writeFile(join(root, "index.html"), "<html><main>首頁</main></html>");
    await writeBasicPages(root);
    await mkdir(join(root, "spots", "example-park"), { recursive: true });
    await mkdir(join(root, "spots", "example-museum"), { recursive: true });
    await assert.rejects(checkOutput(root, "tests/fixtures/spots"), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("formal output rejects spot image assets even outside YAML content", async () => {
  const root = await mkdtemp(join(tmpdir(), "carltravel-image-output-"));
  try {
    const output = join(root, "dist");
    const content = join(root, "content");
    await mkdir(output);
    await mkdir(content);
    await writeFile(
      join(output, "index.html"),
      "<html><main>首頁</main></html>",
    );
    await writeBasicPages(output);
    await writeFile(join(output, "spot-photo.webp"), "fixture");
    await assert.rejects(checkOutput(output, content), /圖片/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("formal sitemap contains only home, about, and exactly the formal spots", async () => {
  const root = await mkdtemp(join(tmpdir(), "carltravel-sitemap-"));
  const output = join(root, "dist");
  const content = join(root, "content");
  const home = "https://carltravel.gravito.dev/";
  const about = "https://carltravel.gravito.dev/about/";
  const writeSitemap = (urls: string[]) =>
    writeFile(
      join(output, "sitemap.xml"),
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${url}</loc></url>`).join("")}</urlset>`,
    );
  try {
    await mkdir(content);
    await mkdir(join(output, "about"), { recursive: true });
    for (const page of ["index.html", "about/index.html", "404.html"])
      await writeFile(join(output, page), "<html><main>公開頁面</main></html>");
    await writeSearchEntry(output);
    await writeSitemap([home, about]);
    assert.equal(await checkOutput(output, content), 0);
    for (const extra of [
      "404.html",
      "spots/example-park/",
      "drafts/private-spot/",
      "dev/preview/",
    ]) {
      await writeSitemap([home, about, `${home}${extra}`]);
      await assert.rejects(checkOutput(output, content), /sitemap/);
    }
    await writeSitemap([home]);
    await assert.rejects(checkOutput(output, content), /sitemap/);
    await writeSitemap([home, about, about]);
    await assert.rejects(checkOutput(output, content), /sitemap/);
    await writeSitemap(["https://example.org/", about]);
    await assert.rejects(checkOutput(output, content), /sitemap/);
    await mkdir(join(content, "approved-park"));
    await copyApproved(content);
    await mkdir(join(output, "spots", "approved-park"), { recursive: true });
    await writeFile(
      join(output, "spots", "approved-park", "index.html"),
      "<html><main>核准景點</main></html>",
    );
    await writeSitemap([home, about]);
    await assert.rejects(checkOutput(output, content), /sitemap/);
    await writeSitemap([home, about, `${home}spots/approved-park/`]);
    await writeSearchEntry(output, 1);
    await writeList(output, content);
    assert.equal(await checkOutput(output, content), 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("formal output rejects a missing or fixture-sized search index", async () => {
  const root = await mkdtemp(join(tmpdir(), "carltravel-search-output-"));
  const content = join(root, "content");
  try {
    await mkdir(content);
    await writeFile(join(root, "index.html"), "<html><main>首頁</main></html>");
    await writeBasicPages(root);
    await mkdir(join(root, "pagefind"), { recursive: true });
    await writeFile(
      join(root, "pagefind", "pagefind-entry.json"),
      JSON.stringify({ languages: { "zh-Hant": { page_count: 2 } } }),
    );
    await assert.rejects(checkOutput(root, content), /search index/);
    await rm(join(root, "pagefind"), { recursive: true });
    await assert.rejects(checkOutput(root, content), /ENOENT/);
    await writeSearchEntry(root);
    assert.equal(await checkOutput(root, content), 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("formal output allows only the reviewed site artwork at its exact path", async () => {
  const root = await mkdtemp(join(tmpdir(), "carltravel-artwork-output-"));
  const output = join(root, "dist");
  const content = join(root, "content");
  const original = "public/illustrations/family-outing.png";
  const allowed = join(output, "illustrations/family-outing.png");
  try {
    await mkdir(content);
    await mkdir(join(output, "illustrations"), { recursive: true });
    await writeFile(
      join(output, "index.html"),
      "<html><main>首頁</main></html>",
    );
    await writeBasicPages(output);
    await copyFile(original, allowed);
    assert.equal(await checkOutput(output, content), 0);
    for (const name of [
      "extra.png",
      "illustrations/renamed.png",
      "nested/illustrations/family-outing.png",
    ]) {
      const target = join(output, name);
      await mkdir(join(target, ".."), { recursive: true });
      await copyFile(original, target);
      await assert.rejects(checkOutput(output, content), /圖片/);
      await rm(target);
    }
    await writeFile(allowed, "unreviewed replacement");
    await assert.rejects(checkOutput(output, content), /圖片/);
    await rm(allowed);
    await symlink(join(process.cwd(), original), allowed);
    await assert.rejects(checkOutput(output, content), /symbolic link/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function budgetFixture(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const content = join(root, "content");
  await mkdir(content);
  await writeFile(join(root, "index.html"), "<html><main>首頁</main></html>");
  await writeBasicPages(root);
  return { root, content };
}

test("output gate fails when the file count exceeds the budget", async () => {
  const { root, content } = await budgetFixture("carltravel-files-");
  try {
    assert.equal(budget.maxFiles, 18_000);
    // 基本輸出共 8 個檔案；上限剛好等於檔案數時通過，少 1 就失敗
    assert.equal(
      await checkOutput(root, content, undefined, { maxFiles: 8 }),
      0,
    );
    await assert.rejects(
      checkOutput(root, content, undefined, { maxFiles: 7 }),
      /檔案總數/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("output gate fails when the list JSON is too large raw or brotli", async () => {
  const { root, content } = await budgetFixture("carltravel-size-");
  try {
    assert.equal(budget.listBrotliBytes, 400 * 1024);
    assert.equal(budget.listRawBytes, 1.5 * 1024 * 1024);
    // 空 JSON 約 150 B：原始上限與 brotli 上限各自獨立判定
    assert.equal(
      await checkOutput(root, content, undefined, {
        listRawBytes: 1000,
        listBrotliBytes: 1000,
      }),
      0,
    );
    await assert.rejects(
      checkOutput(root, content, undefined, { listRawBytes: 10 }),
      /原始/,
    );
    await assert.rejects(
      checkOutput(root, content, undefined, { listBrotliBytes: 10 }),
      /brotli/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("output gate fails when the list JSON leaks fixture names or ids, or its row count differs", async () => {
  const { root, content } = await budgetFixture("carltravel-leak-");
  const listFile = join(root, "spot-list", "list.json");
  const fixtures = "tests/fixtures/spots";
  try {
    const [fixtureSpot] = await loadSpots(fixtures);
    // 筆數不符：正式內容零筆，JSON 卻有一筆
    await mkdir(join(root, "spot-list"), { recursive: true });
    await writeFile(listFile, JSON.stringify(encodeList([fixtureSpot!])));
    await assert.rejects(checkOutput(root, content), /筆數/);
    // 筆數相符但夾帶 fixture 名稱：以正式內容只有 approved-park 的情況驗證
    await mkdir(join(content, "approved-park"));
    await copyApproved(content);
    await mkdir(join(root, "spots", "approved-park"), { recursive: true });
    await writeFile(
      join(root, "spots", "approved-park", "index.html"),
      "<html><main>核准景點</main></html>",
    );
    const sitemap = join(root, "sitemap.xml");
    await writeFile(
      sitemap,
      (await readFile(sitemap, "utf8")).replace(
        "</urlset>",
        "<url><loc>https://carltravel.gravito.dev/spots/approved-park/</loc></url></urlset>",
      ),
    );
    await writeSearchEntry(root, 1);
    await writeList(root, content);
    assert.equal(await checkOutput(root, content, fixtures), 1);
    const museum = (await loadSpots(fixtures)).find(
      (spot) => spot.id === "example-museum",
    )!;
    const real = (await loadSpots(content))[0]!;
    // 名稱洩漏：同一筆的 id 是正式的，只有名稱屬於 fixture
    await writeFile(
      listFile,
      JSON.stringify(encodeList([{ ...real, name: museum.name }])),
    );
    await assert.rejects(checkOutput(root, content, fixtures), /fixture/);
    // id 洩漏：筆數相同，但 id 是草稿或 fixture 的
    await writeFile(
      listFile,
      JSON.stringify(encodeList([{ ...real, id: "fx-00001" }])),
    );
    await assert.rejects(
      checkOutput(root, content, fixtures),
      /列表 JSON 含 fixture 名稱或草稿 id/,
    );
    // 產生器 fixture 的名稱同樣不得出現
    const generated = describeSpots({
      seed: FIXTURE_SEED,
      count: FIXTURE_COUNT,
    })[3]!;
    await writeFile(
      listFile,
      JSON.stringify(
        encodeList([{ ...real, summary: generated.spot.name.slice(0, 30) }]),
      ),
    );
    await assert.rejects(checkOutput(root, content, fixtures), /fixture/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("output gate requires exactly one list JSON", async () => {
  const { root, content } = await budgetFixture("carltravel-one-list-");
  try {
    await writeList(root, undefined, "second.json");
    await assert.rejects(checkOutput(root, content), /列表 JSON/);
    await rm(join(root, "spot-list"), { recursive: true });
    await assert.rejects(checkOutput(root, content), /列表 JSON/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
