import { createHash } from "node:crypto";
import { loadBuildSpots } from "./build-spots.ts";
import { encodeList } from "./list.ts";
import { contentMode } from "./mode.ts";
import type { Spot } from "./schema.ts";

export const listUrl = (hash: string) => `/spot-list/${hash}.json`;

const built = new WeakMap<
  readonly Spot[],
  { body: string; hash: string; url: string }
>();

// 建置專用：與 sitemap、Pagefind 一樣只讀單一正式（或 fixture）根目錄，不含草稿。
// 檔名雜湊由內容決定，頁面以同一個函式取得網址，不需要另存清單檔。
export async function buildList(root = contentMode().root) {
  const spots = await loadBuildSpots(root);
  let result = built.get(spots);
  if (!result) {
    const body = JSON.stringify(encodeList(spots));
    const hash = createHash("sha256").update(body).digest("hex").slice(0, 16);
    result = { body, hash, url: listUrl(hash) };
    built.set(spots, result);
  }
  return result;
}
