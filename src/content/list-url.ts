// 列表網址約定：沒有條件時第 1 頁是 `/`、第 N 頁是靜態的 `/page/N/`；
// 有任何條件時留在 `/`，用查詢參數表示，由瀏覽器端渲染。見 docs/adr/0003。
// 瀏覽器端也會用，所以不得引用 node 模組。
import { filterKeys, type ListConditions } from "./list-query.ts";

export const queryParam = "query";
// 列表自己持有的網址參數；其餘參數與錨點不碰
export const ownedParams = [queryParam, ...filterKeys, "page"] as const;

export type ListState = ListConditions & { query: string };

export const hasConditions = (state: ListState) =>
  state.query !== "" || filterKeys.some((key) => state[key] !== "");

export const staticPath = (page: number) =>
  page <= 1 ? "/" : `/page/${page}/`;

// 把狀態寫成網址：沒有條件走靜態路徑，有條件走 `/?…`（第 1 頁不帶 page）
export function listHref(state: ListState) {
  if (!hasConditions(state)) return staticPath(state.page);
  const params = new URLSearchParams();
  if (state.query) params.set(queryParam, state.query);
  for (const key of filterKeys) if (state[key]) params.set(key, state[key]);
  if (state.page > 1) params.set("page", String(state.page));
  return `/?${params}`;
}
