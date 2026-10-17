import { loadSpots } from "./load.ts";
import type { Spot } from "./schema.ts";

// Astro 設定檔載入的模組與打包後的頁面模組是不同實例，
// 所以快取掛在 globalThis，讓同一個建置程序內的所有呼叫端共用。
const cacheKey = Symbol.for("carltravel.buildSpots");
type Cache = Map<string, Promise<Spot[]>>;

// 建置專用：每個根目錄只載入並驗證一次。開發預覽要即時反映檔案變動，不得使用。
export function loadBuildSpots(root: string): Promise<Spot[]> {
  const holder = globalThis as { [cacheKey]?: Cache };
  const cache = (holder[cacheKey] ??= new Map());
  let spots = cache.get(root);
  if (!spots) {
    spots = loadSpots(root);
    cache.set(root, spots);
  }
  return spots;
}
