import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve, dirname, sep } from "node:path";
import { createIndex, close } from "pagefind";
import { loadSpots } from "../src/content/load.ts";

export async function buildSearchIndex(contentRoot: string, output: string) {
  const spots = await loadSpots(contentRoot);
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
        content: html,
      });
      if (result.errors.length)
        throw new Error(`Pagefind ${spot.id}: ${result.errors.join("; ")}`);
    }
    // The native writeFiles response can precede its buffered disk writes; close()
    // kills that service. Own and await the writes before closing it instead.
    const result = await index.getFiles();
    if (result.errors.length)
      throw new Error(`Pagefind output: ${result.errors.join("; ")}`);
    const bundle = resolve(output, "pagefind");
    for (const file of result.files) {
      const path = resolve(bundle, file.path);
      if (!path.startsWith(bundle + sep))
        throw new Error("Pagefind file outside bundle");
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.content);
    }
    console.log(`Pagefind indexed ${spots.length} spot page(s).`);
  } finally {
    await close();
  }
}
