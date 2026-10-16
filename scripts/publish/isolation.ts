import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { chromium } from "@playwright/test";
import { maskPublicCopy, type PublicCopySlots } from "./public-copy.ts";
import { allSpots } from "../research/records.ts";
import { researchDirectory, writeLocal } from "../research/files.ts";
import { checkOutput } from "../check-output.ts";
import {
  officialInformationDescription,
  officialInformationDisclaimer,
  outingIllustrationAlt,
  notFoundIllustrationAlt,
} from "../../src/site.ts";

export function strings(value: unknown, key = ""): string[] {
  if (
    [
      "id",
      "ref",
      "source",
      "checkedAt",
      "readAt",
      "status",
      "kind",
      "setting",
      "county",
      "district",
      "purpose",
    ].includes(key)
  )
    return [];
  if (typeof value === "string") return [value];
  return value && typeof value === "object"
    ? Object.entries(value).flatMap(([name, item]) => strings(item, name))
    : [];
}

// Query the generated browser API, not compressed index bytes or source YAML.
export async function inspectIndex(
  output: string,
  terms: string[],
  html: string[] = [],
  publicSlots: PublicCopySlots[] = [],
) {
  const base = resolve(output);
  const server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(
        new URL(request.url ?? "/", "http://localhost").pathname,
      );
      if (path === "/") {
        response.setHeader("Content-Type", "text/html");
        response.end("<!doctype html><title>Local index check</title>");
        return;
      }
      const file = resolve(base, `.${path}`);
      if (!file.startsWith(base + sep) || !path.startsWith("/pagefind/"))
        throw new Error("Not found");
      response.setHeader(
        "Content-Type",
        file.endsWith(".js")
          ? "text/javascript"
          : file.endsWith(".wasm")
            ? "application/wasm"
            : "application/octet-stream",
      );
      response.end(await readFile(file));
    } catch {
      response.statusCode = 404;
      response.end();
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  let browser;
  try {
    if (!address || typeof address === "string")
      throw new Error("Missing local port");
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/`);
    return await page.evaluate(
      async ({ queries, html, scanHtml }) => {
        const entry = await (
          await fetch("/pagefind/pagefind-entry.json")
        ).json();
        const documents = html.map((text) =>
          new DOMParser().parseFromString(text, "text/html"),
        );
        const decoded = documents.map(
          (doc) => doc.documentElement.textContent ?? "",
        );
        const scanDecoded = scanHtml.map(
          (text) =>
            new DOMParser().parseFromString(text, "text/html").documentElement
              .textContent ?? "",
        );
        // Pagefind deliberately has no language runtime on an empty formal site.
        if (Object.keys(entry.languages ?? {}).length === 0)
          return {
            records: [],
            matches: Object.fromEntries(
              queries.map((term) => [term, [] as string[]]),
            ),
            decoded,
            scanHtml,
            scanDecoded,
          };
        const path = "/pagefind/pagefind.js";
        const index = await import(path);
        type Hit = { data(): Promise<{ url: string; content: string }> };
        const all = await index.search(null);
        const records = await Promise.all(
          all.results.map((hit: Hit) => hit.data()),
        );
        const matches: Record<string, string[]> = {};
        for (const term of queries) {
          const result = await index.search(term);
          matches[term] = await Promise.all(
            result.results.map(async (hit: Hit) => (await hit.data()).url),
          );
        }
        return {
          records: records as { url: string; content: string }[],
          matches,
          decoded,
          scanHtml,
          scanDecoded,
        };
      },
      {
        queries: terms,
        html,
        scanHtml: html.map((text, index) =>
          maskPublicCopy(text, publicSlots[index]),
        ),
      },
    );
  } finally {
    await browser?.close();
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
  }
}

export async function outputText(
  path: string,
): Promise<{ path: string; text: string }[]> {
  const texts: { path: string; text: string }[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || ["drafts", "research"].includes(entry.name))
      throw new Error("私人目錄或符號連結出現在正式輸出");
    const file = join(path, entry.name);
    if (entry.isDirectory()) texts.push(...(await outputText(file)));
    else if (/\.(html|xml|json|js|txt)$/.test(entry.name))
      texts.push({ path: file, text: await readFile(file, "utf8") });
  }
  return texts;
}

export async function checkIsolation(root: string) {
  const output = join(root, "dist");
  await checkOutput(
    output,
    join(root, "content/spots"),
    join(root, "tests/fixtures/spots"),
  );
  const { formal, drafts } = await allSpots(root);
  const formalStrings = formal.flatMap((spot) => strings(spot));
  const privateTerms = [
    ...new Set(drafts.flatMap((spot) => strings(spot))),
  ].filter(
    (text) =>
      text.length > 1 &&
      !formalStrings.some((publicText) => publicText.includes(text)),
  );
  const files = await outputText(output);
  const raw = files.map((file) => file.text);
  const htmlFiles = files.filter((file) => file.text.includes("<html"));
  const publicPages = new Set([
    join(output, "index.html"),
    join(output, "about/index.html"),
    join(output, "404.html"),
    ...formal.map((spot) => join(output, "spots", spot.id, "index.html")),
  ]);
  const inspected = await inspectIndex(
    output,
    [...privateTerms, ...formal.map((spot) => spot.name)],
    htmlFiles.map((file) => file.text),
    htmlFiles.map((file) => ({
      social: publicPages.has(file.path),
      transport: formal.some(
        (spot) => file.path === join(output, "spots", spot.id, "index.html"),
      ),
      imageAlt:
        file.path === join(output, "index.html")
          ? outingIllustrationAlt
          : file.path === join(output, "404.html")
            ? notFoundIllustrationAlt
            : undefined,
    })),
  );
  const urls = inspected.records.map((record) => record.url).sort();
  if (
    JSON.stringify(urls) !==
    JSON.stringify(formal.map((spot) => `/spots/${spot.id}/`).sort())
  )
    throw new Error("Pagefind 含非正式景點或缺少正式景點");
  const texts = [
    ...raw,
    ...inspected.decoded,
    ...inspected.records.map((record) => record.content),
  ];
  // Remove each known public sentence once, only on About. Extra occurrences
  // there, other pages, and Pagefind remain subject to the full private scan.
  const scanCopy = (text: string, path: string) =>
    path === join(output, "about/index.html")
      ? text
          .replace(officialInformationDescription, "")
          .replace(officialInformationDisclaimer, "")
      : text;
  const scanTexts = [
    ...files.map((file) => {
      const index = htmlFiles.indexOf(file);
      return scanCopy(
        index < 0 ? file.text : inspected.scanHtml[index]!,
        file.path,
      );
    }),
    ...inspected.scanDecoded.map((text, index) =>
      scanCopy(text, htmlFiles[index]!.path),
    ),
    ...inspected.records.map((record) => record.content),
  ];
  const unpublishedIds = drafts
    .filter((draft) => !formal.some((spot) => spot.id === draft.id))
    .map((draft) => draft.id);
  for (const [index, text] of texts.entries()) {
    if (
      unpublishedIds.some((id) =>
        new RegExp(`/spots/${id}(?:/|["\\s?#<]|$)`).test(text),
      )
    )
      throw new Error("正式輸出含未發布草稿連結");
    if (/修訂中|本機草稿預覽|(?:research|drafts)\//.test(text))
      throw new Error("草稿或研究路徑出現在正式輸出");
    for (const term of privateTerms)
      if (scanTexts[index]!.includes(term)) {
        await writeLocal(
          join(await researchDirectory(root), "isolation-report.md"),
          `# 正式輸出隔離阻擋\n\n草稿專有文字出現在 dist 頁面或 Pagefind 文件：${term}\n`,
        );
        throw new Error(
          "草稿專有文字出現在正式輸出；詳情見本機 research/isolation-report.md",
        );
      }
  }
  // Query results alone can match stems shared with formal text; decoded documents above
  // determine leakage, while callers can inspect exact synthetic probe queries.
  return { urls, matches: inspected.matches, texts };
}
