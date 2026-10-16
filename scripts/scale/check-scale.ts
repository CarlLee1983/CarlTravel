// 規模檢查：產生 6,000 筆虛構景點、建置到暫存目錄，再對輸出跑檔案數與列表 JSON 檢查。
// 內容與輸出都在暫存目錄，不碰 content/、dist/、dist-fixture/；結束時刪除。
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  budget,
  checkFileCount,
  checkListSize,
  findListJson,
  readListEntries,
} from "../output-budget.ts";
import { writeSpots } from "./generate-spots.ts";

export const SCALE_SEED = 20261018;
export const SCALE_COUNT = 6000;

const require = createRequire(import.meta.url);
const astroPackage = require.resolve("astro/package.json");
const astroBin = resolve(
  dirname(astroPackage),
  require(astroPackage).bin.astro,
);

function build(root: string, output: string) {
  const env = { ...process.env };
  env.CARLTRAVEL_FIXTURE = "1";
  env.CARLTRAVEL_FIXTURE_ROOT = root;
  return new Promise<void>((done, fail) => {
    const child = spawn(
      process.execPath,
      [astroBin, "build", "--force", "--outDir", output],
      { env, stdio: "inherit" },
    );
    child.on("error", fail);
    child.on("exit", (code, signal) =>
      code === 0
        ? done()
        : fail(new Error(`astro build 失敗（${signal ?? `exit ${code}`}）`)),
    );
  });
}

// keep：保留暫存目錄（內含 spots/ 與 dist/），供手動量測腳本使用；呼叫端自行刪除
export async function checkScale(count = SCALE_COUNT, keep = false) {
  const temp = await mkdtemp(join(tmpdir(), "carltravel-scale-"));
  const interrupt = () => {
    void rm(temp, { recursive: true, force: true }).finally(() =>
      process.exit(130),
    );
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
    process.once(signal, interrupt);
  try {
    const root = join(temp, "spots");
    const output = join(temp, "dist");
    await writeSpots(root, { seed: SCALE_SEED, count });
    const started = performance.now();
    await build(root, output);
    const buildSeconds = (performance.now() - started) / 1000;
    const files = await checkFileCount(output, budget.maxFiles);
    const listFile = await findListJson(output);
    const size = await checkListSize(listFile, budget);
    // 內容全是產生景點，沒有 fixture 或草稿可比對，所以只驗筆數與 id
    await readListEntries(listFile, await readdir(root));
    return { count, files, buildSeconds, temp, ...size };
  } catch (error) {
    keep = false;
    throw error;
  } finally {
    if (!keep) await rm(temp, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const keep = process.argv.includes("--keep");
  const result = await checkScale(SCALE_COUNT, keep);
  console.log(
    `check:scale 通過：${result.count} 筆，輸出 ${result.files} 檔（上限 ${budget.maxFiles}），` +
      `列表 JSON 原始 ${result.raw} B、brotli ${result.brotli} B，建置 ${result.buildSeconds.toFixed(1)} 秒。`,
  );
  if (keep)
    console.log(`已保留 ${result.temp}（輸出在 dist/），用畢請自行刪除。`);
}
