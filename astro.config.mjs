import { defineConfig } from "astro/config";
import { siteUrl } from "./src/site.ts";

import { contentMode } from "./src/content/mode.ts";

export default defineConfig({
  site: siteUrl,
  output: "static",
  outDir: contentMode().outDir,
});
