// 靜態列表頁（`/` 與 `/page/N/`）共用：同一批景點只編解碼一次，
// 靜態分頁在建置時會為每一頁呼叫，6,000 筆時不能重算數百次。
import { decodeList, encodeList, type ListEntry } from "./list.ts";
import { pageSize } from "./list-query.ts";
import type { Spot } from "./schema.ts";

const cache = new WeakMap<readonly Spot[], ListEntry[]>();

export function listEntries(spots: readonly Spot[]) {
  let entries = cache.get(spots);
  if (!entries) {
    entries = decodeList(encodeList(spots));
    cache.set(spots, entries);
  }
  return entries;
}

export const totalPagesOf = (count: number) =>
  Math.max(1, Math.ceil(count / pageSize));
