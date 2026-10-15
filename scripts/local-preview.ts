import { fileURLToPath } from "node:url";
import { checkPublicAssets } from "./private-assets.ts";
import { resolve, sep } from "node:path";
import type { AstroIntegration } from "astro";
import { contentMode } from "../src/content/mode.ts";

export function localPreview(): AstroIntegration {
  return {
    name: "local-draft-preview",
    hooks: {
      "astro:config:setup": async ({ command, updateConfig, config }) => {
        await checkPublicAssets(fileURLToPath(config.publicDir));
        updateConfig({
          vite: {
            server: {
              fs: {
                deny: [
                  // Preserve Vite's default secret-file rules when supplying a custom deny list.
                  ".env",
                  ".env.*",
                  "*.{crt,pem,key,p12,pfx,cer,der}",
                  ".npmrc",
                  ".yarnrc.yml",
                  "**/.git/**",
                  "**/drafts/**",
                  "**/research/**",
                ],
              },
            },
            define: {
              // Command identity, not NODE_ENV: a development-mode build is still formal.
              __CARLTRAVEL_DRAFT_PREVIEW__: JSON.stringify(
                command === "dev" && !contentMode().fixture,
              ),
            },
          },
        });
      },
      "astro:server:setup": ({ server, logger }) => {
        if (contentMode().fixture) return;
        const roots = [resolve("drafts"), resolve("content/spots")];
        server.watcher.add(roots);
        let timer: ReturnType<typeof setTimeout>;
        server.watcher.on("all", (event, path) => {
          if (
            !["add", "addDir", "change", "unlink", "unlinkDir"].includes(
              event,
            ) ||
            !roots.some(
              (root) =>
                resolve(path) === root || resolve(path).startsWith(root + sep),
            )
          )
            return;
          clearTimeout(timer);
          // Restart through Vite's public API to clear Astro's static-path cache too.
          timer = setTimeout(() => {
            void server.restart().catch((error) => logger.error(String(error)));
          }, 150);
        });
        server.httpServer?.once("close", () => clearTimeout(timer));
      },
    },
  };
}
