import { defineConfig } from "astro/config";

import { contentMode } from "./src/content/mode.ts";

export default defineConfig({
  output: "static",
  outDir: contentMode().outDir,
});
