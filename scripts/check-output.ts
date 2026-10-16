import { isApprovedSiteAsset } from "./site-assets.ts";
import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { siteUrl } from "../src/site.ts";
import { loadSpots } from "../src/content/load.ts";
import {
  illustrationUrl,
  validateIllustration,
  readIllustration,
} from "../src/content/illustration.ts";

import {
  FIXTURE_COUNT,
  FIXTURE_SEED,
  describeSpots,
} from "./scale/generate-spots.ts";
import { renderThumbnail, thumbnailUrl } from "../src/content/thumbnail.ts";
import {
  budget as defaultBudget,
  checkFileCount,
  checkListSize,
  findListJson,
  readListEntries,
  type Budget,
} from "./output-budget.ts";

export async function checkOutput(
  output = "dist",
  content = "content/spots",
  fixtures = "tests/fixtures/spots",
  limits: Partial<Budget> = {},
) {
  const { maxFiles, listBrotliBytes, listRawBytes } = {
    ...defaultBudget,
    ...limits,
  };
  const formal = await loadSpots(content);
  const formalIds = formal.map((spot) => spot.id).sort();
  const images = new Map(
    formal
      .filter((spot) => spot.illustration)
      .map((spot) => [
        resolve(output, `.${illustrationUrl(spot.id)}`),
        spot.illustration!,
      ]),
  );
  for (const [path, meta] of images)
    validateIllustration(await readFile(path), meta);
  const thumbnails = new Set<string>();
  for (const spot of formal.filter((spot) => spot.illustration)) {
    const path = resolve(output, `.${thumbnailUrl(spot.id)}`);
    const expected = await renderThumbnail(
      await readIllustration(join(content, spot.id), spot.illustration!),
    );
    if (!(await readFile(path)).equals(expected))
      throw new Error(`${path}: 縮圖不符合已驗證插畫`);
    thumbnails.add(path);
  }
  async function requirePage(path: string) {
    const html = await readFile(path, "utf8");
    if (!/<html[\s>]/i.test(html) || !/<main[\s>]/i.test(html))
      throw new Error(`${path}: missing HTML page content`);
  }
  await requirePage(join(output, "index.html"));
  await requirePage(join(output, "about", "index.html"));
  await requirePage(join(output, "404.html"));
  let spotEntries: Dirent[];
  try {
    spotEntries = await readdir(join(output, "spots"), { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      spotEntries = [];
    else throw error;
  }
  const actualIds = spotEntries.map((entry) => entry.name).sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(formalIds))
    throw new Error(
      `Formal spot pages differ from content/spots: expected ${formalIds.join(", ") || "none"}; found ${actualIds.join(", ") || "none"}`,
    );
  for (const id of formalIds)
    await requirePage(join(output, "spots", id, "index.html"));
  const sitemap = await readFile(join(output, "sitemap.xml"), "utf8");
  const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => match[1]!)
    .sort();
  const expectedUrls = [
    "/",
    "/about/",
    ...formalIds.map((id) => `/spots/${id}/`),
  ]
    .map((path) => `${siteUrl}${path}`)
    .sort();
  if (JSON.stringify(sitemapUrls) !== JSON.stringify(expectedUrls))
    throw new Error(
      "sitemap must contain exactly home, about, and formal spot URLs",
    );
  const searchEntry = JSON.parse(
    await readFile(join(output, "pagefind", "pagefind-entry.json"), "utf8"),
  );
  const languages: { page_count: number }[] = Object.values(
    searchEntry.languages ?? {},
  );
  if (
    languages.some(
      (language) =>
        !Number.isInteger(language.page_count) || language.page_count < 0,
    ) ||
    languages.reduce((total, language) => total + language.page_count, 0) !==
      formalIds.length
  )
    throw new Error(
      "Formal search index page count differs from content/spots",
    );
  await readFile(join(output, "pagefind", "pagefind.js"));
  const fixture = await loadSpots(fixtures);
  // e2e fixture 另含固定種子的產生景點，其名稱同樣不得出現在正式輸出
  const generatedNames = describeSpots({
    seed: FIXTURE_SEED,
    count: FIXTURE_COUNT,
  }).map(({ spot }) => spot.name);
  const fixtureIds = [
    ...fixture
      .filter((spot) => !formalIds.includes(spot.id))
      .map((spot) => spot.id),
    ...describeSpots({ seed: FIXTURE_SEED, count: FIXTURE_COUNT }).map(
      ({ id }) => id,
    ),
  ];
  const fixtureNames = [
    ...fixture
      .filter((spot) => !formalIds.includes(spot.id))
      .map((spot) => spot.name),
    ...generatedNames,
  ];
  await checkFileCount(output, maxFiles);
  const listFile = await findListJson(output);
  await checkListSize(listFile, { listBrotliBytes, listRawBytes });
  await readListEntries(listFile, formalIds, [
    ...fixtureNames,
    ...fixtureIds.filter((id) => !formalIds.includes(id)),
  ]);
  async function checkHtml(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`${path}: symbolic link in formal output`);
      if (
        /\.(?:avif|bmp|gif|heic|ico|jpe?g|png|svg|tiff?|webp)$/i.test(
          entry.name,
        ) &&
        !(
          entry.isFile() &&
          (images.has(resolve(path)) ||
            thumbnails.has(resolve(path)) ||
            (await isApprovedSiteAsset(output, path)))
        )
      )
        throw new Error(`${path}: 正式輸出不得包含景點圖片資產`);
      if (entry.isDirectory()) await checkHtml(path);
      else if (entry.isFile() && entry.name.endsWith(".html")) {
        const html = await readFile(path, "utf8");
        for (const name of [...fixtureNames, "開發展示 · 虛構景點與出處"])
          if (html.includes(name))
            throw new Error(
              `${path}: fixture marker leaked into formal output`,
            );
      }
    }
  }
  await checkHtml(output);
  return formalIds.length;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const count = await checkOutput();
  console.log(
    `Formal output contains exactly ${count} spot page(s), with no fixture markers.`,
  );
}
