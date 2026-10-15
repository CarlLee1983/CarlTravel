import { fileURLToPath } from "node:url";
import { buildSearchIndex } from "./scripts/search-index.ts";
import { defineConfig } from "astro/config";
import { siteUrl } from "./src/site.ts";

import { contentMode } from "./src/content/mode.ts";

export default defineConfig({
  site: siteUrl,
  output: "static",
  // Keep the search entry external so Vite finalizes its lazy-import preload references.
  vite: { build: { assetsInlineLimit: 0 } },
  outDir: contentMode().outDir,
  integrations: [
    {
      name: "spot-search",
      hooks: {
        "astro:build:done": async ({ dir }) => {
          await buildSearchIndex(contentMode().root, fileURLToPath(dir));
        },
      },
    },
  ],
});
