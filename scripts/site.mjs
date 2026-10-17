import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const astroPackage = require.resolve("astro/package.json");
const astroBin = resolve(
  dirname(astroPackage),
  require(astroPackage).bin.astro,
);

const command = process.argv[2] ?? "";
const options = process.argv.slice(3);
const fixture = options[0] === "fixture";
const rest = options.slice(fixture ? 1 : 0).filter((option) => option !== "--");

if (
  !new Set(["dev", "build", "preview", "check-content"]).has(command) ||
  (command === "check-content" && rest.length > 0)
) {
  console.error(
    "Usage: node scripts/site.mjs <dev|build|preview|check-content> [fixture]",
  );
  process.exit(2);
}

const env = { ...process.env };
delete env.CARLTRAVEL_FIXTURE;
delete env.CARLTRAVEL_FIXTURE_ROOT;
if (fixture) env.CARLTRAVEL_FIXTURE = "1";

// fixture 的 dev 與 build 讀「手寫 2 筆＋產生器 60 筆」，組在暫存目錄，結束時刪除。
// preview 只提供已建好的 dist-fixture，不需要內容根目錄。
/** @type {string | undefined} */
let fixtureRoot;
if (fixture && (command === "dev" || command === "build")) {
  const assembled = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/scale/fixture-root.ts"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  if (assembled.status !== 0) process.exit(assembled.status ?? 1);
  fixtureRoot = assembled.stdout.trim();
  env.CARLTRAVEL_FIXTURE_ROOT = fixtureRoot;
}
const cleanup = () => {
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
};

const args =
  command === "check-content"
    ? ["--experimental-strip-types", "scripts/check-content.ts"]
    : [astroBin, command, ...(command === "build" ? ["--force"] : []), ...rest];
const child = spawn(process.execPath, args, { env, stdio: "inherit" });
// 被訊號終止時也要刪除暫存內容根目錄，再用同一個訊號結束自己
for (const signal of /** @type {const} */ (["SIGINT", "SIGTERM", "SIGHUP"]))
  process.once(signal, () => {
    cleanup();
    child.kill(signal);
    process.kill(process.pid, signal);
  });
child.on("error", (error) => {
  cleanup();
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  cleanup();
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
