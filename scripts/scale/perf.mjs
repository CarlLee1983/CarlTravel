// @ts-nocheck 手動量測腳本，瀏覽器內的 window 擴充與 CDP 事件不值得逐一標型別
// 手機首屏量測（手動，不進 CI）：
// 本機靜態伺服器（文字類以 brotli 回應，仿 Cloudflare）＋ Playwright Chromium + CDP 節流。
// 條件對應規格「效能預算」：390px、4 倍 CPU 降速、Slow 4G、無快取。
// 用法：node scripts/scale/perf.mjs <dist 目錄> <次數> <路徑...>
// 例：  node scripts/scale/perf.mjs "$DIST" 3 / "/?county=臺南市" /spots/fx-00001/
// 6,000 筆輸出可用 `node --experimental-strip-types scripts/scale/check-scale.ts --keep` 取得。
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { brotliCompressSync, constants as zc } from "node:zlib";
import { join, extname, normalize, resolve } from "node:path";
import { chromium } from "@playwright/test";

const [distArg, runsArg, ...paths] = process.argv.slice(2);
const runs = Number(runsArg);
if (!distArg || !Number.isInteger(runs) || runs < 1 || paths.length === 0) {
  console.error("Usage: node scripts/scale/perf.mjs <dist> <runs> <path...>");
  process.exit(2);
}
const dist = resolve(distArg);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".xml": "application/xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};
const compressible = new Set([".html", ".js", ".css", ".svg", ".xml", ".json"]);
const brCache = new Map();
const server = createServer(async (req, res) => {
  try {
    const path = normalize(
      decodeURIComponent(new URL(req.url, "http://x").pathname),
    );
    let file = join(dist, path);
    if (!file.startsWith(dist)) throw new Error("outside dist");
    if ((await stat(file).catch(() => null))?.isDirectory())
      file = join(file, "index.html");
    let body = await readFile(file);
    const ext = extname(file);
    const headers = {
      "content-type": types[ext] ?? "application/octet-stream",
      "cache-control": "no-store",
    };
    if (
      compressible.has(ext) &&
      /\bbr\b/.test(req.headers["accept-encoding"] ?? "")
    ) {
      if (!brCache.has(file))
        brCache.set(
          file,
          brotliCompressSync(body, {
            params: { [zc.BROTLI_PARAM_QUALITY]: 4 },
          }),
        );
      body = brCache.get(file);
      headers["content-encoding"] = "br";
    }
    res.writeHead(200, headers).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;

// Lighthouse「Slow 4G」套用到 DevTools 的節流值
const network = {
  offline: false,
  latency: 562.5,
  downloadThroughput: (1474.56 * 1024) / 8,
  uploadThroughput: (675 * 1024) / 8,
};

const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const browser = await chromium.launch();
const out = {};
try {
  for (const path of paths) {
    const samples = [];
    for (let i = 0; i < runs; i++) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Network.emulateNetworkConditions", network);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      let bytes = 0;
      let requests = 0;
      const byType = {};
      const typeOf = new Map();
      cdp.on("Network.responseReceived", (e) =>
        typeOf.set(e.requestId, e.type),
      );
      cdp.on("Network.loadingFinished", (e) => {
        bytes += e.encodedDataLength;
        requests++;
        const type = typeOf.get(e.requestId) ?? "Other";
        byType[type] = (byType[type] ?? 0) + e.encodedDataLength;
      });
      await page.addInitScript(() => {
        window.__lcp = 0;
        window.__tbt = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) window.__lcp = e.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries())
            window.__tbt += Math.max(0, e.duration - 50);
        }).observe({ type: "longtask", buffered: true });
      });
      await page.goto(origin + path, { waitUntil: "load", timeout: 600000 });
      await page.waitForTimeout(1500);
      const metrics = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        return {
          fcp:
            performance.getEntriesByName("first-contentful-paint")[0]
              ?.startTime ?? null,
          lcp: window.__lcp,
          dcl: nav.domContentLoadedEventEnd,
          load: nav.loadEventEnd,
          tbt: window.__tbt,
          dom: document.getElementsByTagName("*").length,
        };
      });
      samples.push({ ...metrics, bytes, requests, byType });
      await context.close();
    }
    const keys = [
      "fcp",
      "lcp",
      "dcl",
      "load",
      "tbt",
      "dom",
      "bytes",
      "requests",
    ];
    out[path] = {
      median: Object.fromEntries(
        keys.map((k) => [k, Math.round(median(samples.map((s) => s[k])))]),
      ),
      samples,
    };
  }
} finally {
  await browser.close();
  server.close();
}
console.log(JSON.stringify(out, null, 1));
