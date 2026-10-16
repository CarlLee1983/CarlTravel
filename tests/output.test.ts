import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  copyFile,
  symlink,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkOutput } from "../scripts/check-output.ts";
import {
  FIXTURE_COUNT,
  FIXTURE_SEED,
  describeSpots,
} from "../scripts/scale/generate-spots.ts";

async function writeSearchEntry(output: string, count = 0) {
  await mkdir(join(output, "pagefind"), { recursive: true });
  await writeFile(
    join(output, "pagefind", "pagefind-entry.json"),
    JSON.stringify({ languages: { "zh-Hant": { page_count: count } } }),
  );
  await writeFile(join(output, "pagefind", "pagefind.js"), "export {}; ");
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
    await copyFile(
      "tests/fixtures/spots/example-park/spot.yaml",
      join(content, "approved-park", "spot.yaml"),
    );
    await mkdir(join(output, "spots", "approved-park"), { recursive: true });
    await writeFile(
      join(output, "spots", "approved-park", "index.html"),
      "<html><main>核准景點</main></html>",
    );
    await writeSitemap([home, about]);
    await assert.rejects(checkOutput(output, content), /sitemap/);
    await writeSitemap([home, about, `${home}spots/approved-park/`]);
    await writeSearchEntry(output, 1);
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
