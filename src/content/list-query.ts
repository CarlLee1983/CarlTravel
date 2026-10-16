// 列表查詢：解碼後的列表資料 + 條件 → 該頁的卡片、範圍與修正後的條件。
// 純函式，不碰 DOM 與網路，所以靜態分頁（建置時）與瀏覽器端篩選共用同一份邏輯，
// 也不得引用 node 模組或 zod（瀏覽器會打包此檔）。
// 之後的行政區、選後筆數、年齡未標示計數、移除後筆數都從這裡擴充：
// 篩選維度集中在 filters 表，新增維度只需加一列。
import { counties } from "./counties.ts";
import type { ListEntry } from "./list.ts";
import { ageBandRanges } from "./search.ts";

export const pageSize = 24;
export const ageUnknownLabel = "年齡未標示";

export const filterKeys = ["county", "kind", "setting", "age"] as const;
export type FilterKey = (typeof filterKeys)[number];

// 一筆景點在某個維度上的值；年齡可同時落在多個年齡帶
const filters: Record<FilterKey, (entry: ListEntry) => readonly string[]> = {
  county: (entry) => [entry.county],
  kind: (entry) => [entry.kind],
  setting: (entry) => [entry.setting],
  age: (entry) => entryAgeLabels(entry),
};

export function entryAgeLabels(entry: ListEntry): string[] {
  if (!entry.age) return [ageUnknownLabel];
  const { min, max } = entry.age;
  return ageBandRanges
    .filter((band) => min <= band.max && (max ?? Infinity) >= band.min)
    .map((band) => band.label);
}

export type ListConditions = Record<FilterKey, string> & { page: number };

export interface ListQueryInput extends Partial<Record<FilterKey, string>> {
  // 文字查詢命中的景點 id，依相關度排序；null 或未提供表示沒有文字條件
  hits?: readonly string[] | null;
  // 網址上的原始頁碼字串；也接受數字
  page?: string | number | null;
}

export interface ListQueryResult {
  conditions: ListConditions;
  // 輸入的條件值被修正或捨棄，或頁碼不是正規寫法時為 true，呼叫端應 replaceState
  needsUrlReplace: boolean;
  rows: ListEntry[];
  // 沒有結果時 from、to 為 0
  range: { from: number; to: number; total: number };
  totalPages: number;
}

const collator = new Intl.Collator("zh-Hant");
const countyRank = new Map<string, number>(
  counties.map((county, index) => [county, index]),
);
const naturalOrder = new WeakMap<readonly ListEntry[], ListEntry[]>();

// 沒有文字時的順序：縣市北到南、同縣市依名稱，名稱相同再依 id。
// 同一份資料只排一次，靜態分頁在建置時會對同一批資料連續查詢數百次。
function inNaturalOrder(entries: readonly ListEntry[]) {
  let sorted = naturalOrder.get(entries);
  if (!sorted) {
    sorted = [...entries].sort(
      (a, b) =>
        (countyRank.get(a.county) ?? Infinity) -
          (countyRank.get(b.county) ?? Infinity) ||
        collator.compare(a.name, b.name) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    naturalOrder.set(entries, sorted);
  }
  return sorted;
}

const positiveInteger = /^[1-9][0-9]*$/;

function parsePage(raw: ListQueryInput["page"]) {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "number")
    return Number.isInteger(raw) && raw > 0 ? raw : 1;
  return positiveInteger.test(raw) ? Number(raw) : 1;
}

export function queryList(
  entries: readonly ListEntry[],
  input: ListQueryInput,
): ListQueryResult {
  let needsUrlReplace = false;
  const chosen = {} as Record<FilterKey, string>;
  for (const key of filterKeys) {
    const raw = input[key] ?? "";
    // 值必須真的出現在資料裡；不符的忽略，不當成 0 筆
    const valid =
      raw !== "" && entries.some((entry) => filters[key](entry).includes(raw));
    chosen[key] = valid ? raw : "";
    if (raw !== "" && !valid) needsUrlReplace = true;
  }

  let matched = (input.hits ? entries : inNaturalOrder(entries)).filter(
    (entry) =>
      filterKeys.every(
        (key) => !chosen[key] || filters[key](entry).includes(chosen[key]),
      ),
  );
  if (input.hits) {
    const rank = new Map<string, number>();
    input.hits.forEach((id, index) => {
      if (!rank.has(id)) rank.set(id, index);
    });
    matched = matched
      .filter((entry) => rank.has(entry.id))
      .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  }

  const total = matched.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const requested = parsePage(input.page);
  const page = Math.min(requested ?? 1, totalPages);
  // 明寫的 page=1 不是正規網址（第 1 頁不帶頁碼）
  if (requested !== null && (page === 1 || String(page) !== String(input.page)))
    needsUrlReplace = true;

  const start = (page - 1) * pageSize;
  const rows = matched.slice(start, start + pageSize);
  return {
    conditions: { ...chosen, page },
    needsUrlReplace,
    rows,
    range: {
      from: total === 0 ? 0 : start + 1,
      to: total === 0 ? 0 : start + rows.length,
      total,
    },
    totalPages,
  };
}
