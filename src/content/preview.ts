import { lstat } from "node:fs/promises";
import { loadBuildSpots } from "./build-spots.ts";
import { loadSpots, compareSpots } from "./load.ts";
import { contentMode } from "./mode.ts";
import type { Spot } from "./schema.ts";

export type PageSpot = Spot & { preview?: "新草稿" | "修訂中" };

// Only page rendering opts in. Discovery and production loaders stay single-root.
export async function loadPageSpots(preview: boolean): Promise<PageSpot[]> {
  const mode = contentMode();
  // 預覽（dev）每次重讀以即時反映檔案；正式建置共用同一份載入結果。
  if (!preview) return loadBuildSpots(mode.root);
  const formal = await loadSpots(mode.root);
  if (mode.fixture) return formal;
  for (const directory of ["drafts", "drafts/spots"]) {
    try {
      if (!(await lstat(directory)).isDirectory())
        throw new Error(
          `${directory}: 草稿目錄必須是一般資料夾，不得為符號連結`,
        );
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return formal;
      throw error;
    }
  }
  const merged = new Map<string, PageSpot>(
    formal.map((spot) => [spot.id, spot]),
  );
  for (const spot of await loadSpots("drafts/spots"))
    merged.set(spot.id, {
      ...spot,
      preview: merged.has(spot.id) ? "修訂中" : "新草稿",
    });
  return [...merged.values()].sort(compareSpots);
}
