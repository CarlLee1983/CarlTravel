import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve, dirname, sep } from "node:path";
import { gunzipSync } from "node:zlib";
import { createIndex, close } from "pagefind";
import { loadBuildSpots } from "../src/content/build-spots.ts";
import { normalizeSearchText } from "../src/content/search.ts";

// Pagefind 命中的 id 就是片段檔名（不含副檔名），內容的 url 才說明它是哪個景點。
// 瀏覽器端要把幾千筆命中對回景點 id，逐筆載入片段太貴，所以建置時把對照表
// 寫成 pagefind/spot-ids.json：{ "<命中 id>": "<景點 id>" }。
export const spotIdsFile = "spot-ids.json";
const fragmentName = /^fragment\/(.+)\.pf_fragment$/;
const fragmentPrefix = "pagefind_dcd";

export function spotIdsFromFragments(
  files: readonly { path: string; content: Uint8Array }[],
) {
  const ids: Record<string, string> = {};
  for (const file of files) {
    const name = fragmentName.exec(file.path)?.[1];
    if (!name) continue;
    const text = gunzipSync(file.content).toString("utf8");
    if (!text.startsWith(fragmentPrefix))
      throw new Error(`Pagefind fragment ${name}: unexpected format`);
    const { url } = JSON.parse(text.slice(fragmentPrefix.length)) as {
      url: string;
    };
    const id = /^\/spots\/([^/]+)\/$/.exec(url)?.[1];
    if (!id)
      throw new Error(`Pagefind fragment ${name}: unexpected url ${url}`);
    ids[name] = id;
  }
  return ids;
}

export async function buildSearchIndex(contentRoot: string, output: string) {
  const spots = await loadBuildSpots(contentRoot);
  try {
    const { index, errors } = await createIndex({
      rootSelector: "[data-pagefind-body]",
      forceLanguage: "zh-Hant",
    });
    if (errors.length || !index)
      throw new Error(`Pagefind: ${errors.join("; ")}`);
    // An explicit page list prevents Pagefind's whole-body fallback on empty sites.
    for (const spot of spots) {
      const html = await readFile(
        join(output, "spots", spot.id, "index.html"),
        "utf8",
      );
      if (!html.includes("data-pagefind-body"))
        throw new Error(`${spot.id}: missing search field whitelist`);
      const result = await index.addHTMLFile({
        url: `/spots/${spot.id}/`,
        // 台／臺同字：索引裡只留「台」，查詢端也轉成「台」。磁碟上的頁面不變。
        content: normalizeSearchText(html),
      });
      if (result.errors.length)
        throw new Error(`Pagefind ${spot.id}: ${result.errors.join("; ")}`);
    }
    // The native writeFiles response can precede its buffered disk writes; close()
    // kills that service. Own and await the writes before closing it instead.
    const result = await index.getFiles();
    if (result.errors.length)
      throw new Error(`Pagefind output: ${result.errors.join("; ")}`);
    const ids = spotIdsFromFragments(result.files);
    if (Object.keys(ids).length !== spots.length)
      throw new Error(
        `Pagefind fragments (${Object.keys(ids).length}) do not match spots (${spots.length})`,
      );
    const bundle = resolve(output, "pagefind");
    for (const file of result.files) {
      const path = resolve(bundle, file.path);
      if (!path.startsWith(bundle + sep))
        throw new Error("Pagefind file outside bundle");
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.content);
    }
    await writeFile(join(bundle, spotIdsFile), JSON.stringify(ids));
    console.log(`Pagefind indexed ${spots.length} spot page(s).`);
  } finally {
    await close();
  }
}
