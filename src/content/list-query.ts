// 列表查詢：解碼後的列表資料 + 條件 → 該頁的卡片、範圍與修正後的條件。
// 純函式，不碰 DOM 與網路，所以靜態分頁（建置時）與瀏覽器端篩選共用同一份邏輯，
// 也不得引用 node 模組或 zod（瀏覽器會打包此檔）。
// 篩選維度集中在 filters 表，新增維度只需加一列；
// 選項、選後筆數與維度可見性（filterOptions）也在這裡，伺服器端與瀏覽器端共用。
import { counties } from "./counties.ts";
import type { ListEntry } from "./list.ts";
import { ageBandRanges } from "./search.ts";

export const pageSize = 24;

// 行政區是縣市的第二層：只有選了縣市、且屬於該縣市時才有效
export const filterKeys = [
  "county",
  "district",
  "kind",
  "setting",
  "age",
] as const;
export type FilterKey = (typeof filterKeys)[number];

// 一筆景點在某個維度上的值；年齡可同時落在多個年齡帶
const filters: Record<FilterKey, (entry: ListEntry) => readonly string[]> = {
  county: (entry) => [entry.county],
  district: (entry) => [entry.district],
  kind: (entry) => [entry.kind],
  setting: (entry) => [entry.setting],
  age: (entry) => entryAgeLabels(entry),
};

// 年齡未標示的景點不屬於任何年齡帶：未知不算相符，也不是可選的選項
// （選了年齡帶之後的未標示筆數由 ageUnknownCount 另外說明）
export function entryAgeLabels(entry: ListEntry): string[] {
  if (!entry.age) return [];
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

// 各維度在資料中出現的值（已排序）；行政區依縣市分開。同一份資料只掃一次。
interface Universe {
  lists: Record<Exclude<FilterKey, "district">, string[]>;
  districts: Map<string, string[]>;
  // 整份資料（行政區則是該縣市的資料）裡，選某個值會得到和不選不同的結果集
  splits: Record<Exclude<FilterKey, "district">, boolean>;
  districtSplits: Map<string, boolean>;
}
const universes = new WeakMap<readonly ListEntry[], Universe>();

const ageRank = new Map<string, number>(
  ageBandRanges.map((band, index) => [band.label, index]),
);
const sortBy = {
  county: (a: string, b: string) =>
    (countyRank.get(a) ?? Infinity) - (countyRank.get(b) ?? Infinity),
  age: (a: string, b: string) => ageRank.get(a)! - ageRank.get(b)!,
  name: (a: string, b: string) => collator.compare(a, b),
};

function universeOf(entries: readonly ListEntry[]): Universe {
  let universe = universes.get(entries);
  if (universe) return universe;
  const seen = {
    county: new Map<string, number>(),
    kind: new Map<string, number>(),
    setting: new Map<string, number>(),
    age: new Map<string, number>(),
  };
  const bump = (map: Map<string, number>, value: string) =>
    map.set(value, (map.get(value) ?? 0) + 1);
  const byCounty = new Map<string, Map<string, number>>();
  for (const entry of entries) {
    bump(seen.county, entry.county);
    bump(seen.kind, entry.kind);
    bump(seen.setting, entry.setting);
    for (const label of entryAgeLabels(entry)) bump(seen.age, label);
    let districts = byCounty.get(entry.county);
    if (!districts) byCounty.set(entry.county, (districts = new Map()));
    bump(districts, entry.district);
  }
  // 有任一個選項只涵蓋一部分，選它才會縮小結果；所有選項都涵蓋全部（或只有一個選項）就沒有區分作用
  const splits = (counts: Map<string, number>, size: number) =>
    [...counts.values()].some((count) => count < size);
  universe = {
    lists: {
      county: [...seen.county.keys()].sort(sortBy.county),
      kind: [...seen.kind.keys()].sort(sortBy.name),
      setting: [...seen.setting.keys()].sort(sortBy.name),
      age: [...seen.age.keys()].sort(sortBy.age),
    },
    districts: new Map(
      [...byCounty].map(([county, counts]) => [
        county,
        [...counts.keys()].sort(sortBy.name),
      ]),
    ),
    splits: {
      county: splits(seen.county, entries.length),
      kind: splits(seen.kind, entries.length),
      setting: splits(seen.setting, entries.length),
      age: splits(seen.age, entries.length),
    },
    districtSplits: new Map(
      [...byCounty].map(([county, counts]) => [
        county,
        splits(counts, seen.county.get(county)!),
      ]),
    ),
  };
  universes.set(entries, universe);
  return universe;
}

function validValues(universe: Universe, key: FilterKey, county: string) {
  return key === "district"
    ? (universe.districts.get(county) ?? [])
    : universe.lists[key];
}

// 條件值必須真的出現在資料裡；不符的忽略，不當成 0 筆。
// 行政區必須屬於已選且有效的縣市，只有行政區、或與縣市不符時一併捨棄。
function normalizeFilters(
  entries: readonly ListEntry[],
  input: Partial<Record<FilterKey, string>>,
) {
  const universe = universeOf(entries);
  const chosen = {} as Record<FilterKey, string>;
  let changed = false;
  for (const key of filterKeys) {
    const raw = input[key] ?? "";
    const valid =
      raw !== "" && validValues(universe, key, chosen.county).includes(raw);
    chosen[key] = valid ? raw : "";
    if (raw !== "" && !valid) changed = true;
  }
  return { chosen, changed };
}

export interface FilterOption {
  value: string;
  // 選了這個選項後剩幾筆：納入其他已選條件與文字命中
  count: number;
  // 0 筆且不是目前已選的選項
  disabled: boolean;
}
export interface FilterDimension {
  selected: string;
  // 不含自己這個維度的條件時符合的筆數，即「全部」選項的筆數
  total: number;
  // 整份資料都無法區分（選任何一項結果都一樣，或只有一項）、或行政區尚未選縣市時為 false，
  // 介面應整個隱藏；已選的維度一律可見。只看整份資料，不隨條件或文字命中改變，版面才不會跳動
  visible: boolean;
  options: FilterOption[];
}
export type FilterOptions = Record<FilterKey, FilterDimension>;

const filterBit = Object.fromEntries(
  filterKeys.map((key, index) => [key, 1 << index]),
) as Record<FilterKey, number>;

// 各維度的選項與選後筆數。整份資料只掃一次：每筆記下它不符合哪些條件，
// 只有一個維度不符（或全符合）的景點才會計入那個維度的選項，所以成本是 O(筆數 × 維度數)，
// 與選項數無關。改縣市會清掉行政區，所以其他縣市的筆數不套用行政區條件。
export function filterOptions(
  entries: readonly ListEntry[],
  input: Partial<Record<FilterKey, string>> & {
    hits?: readonly string[] | null;
  },
): FilterOptions {
  const universe = universeOf(entries);
  const { chosen } = normalizeFilters(entries, input);
  const hitSet = input.hits ? new Set(input.hits) : null;
  const active = filterKeys.filter((key) => chosen[key] !== "");
  const tally = {} as Record<FilterKey, Map<string, number>>;
  const total = {} as Record<FilterKey, number>;
  for (const key of filterKeys) {
    total[key] = 0;
    tally[key] = new Map(
      validValues(universe, key, chosen.county).map((value) => [value, 0]),
    );
  }
  const countyTierBits = filterBit.county | filterBit.district;
  const add = (key: FilterKey, entry: ListEntry) => {
    total[key]++;
    const map = tally[key];
    for (const value of filters[key](entry))
      map.set(value, (map.get(value) ?? 0) + 1);
  };

  for (const entry of entries) {
    if (hitSet && !hitSet.has(entry.id)) continue;
    let failed = 0;
    for (const key of active)
      if (!filters[key](entry).includes(chosen[key])) failed |= filterBit[key];
    for (const key of filterKeys) {
      if (key === "district" && !chosen.county) continue;
      if ((failed & ~filterBit[key]) === 0) add(key, entry);
      else if (
        key === "county" &&
        failed & filterBit.district &&
        failed & filterBit.county &&
        (failed & ~countyTierBits) === 0
      )
        add(key, entry);
    }
  }

  const result = {} as FilterOptions;
  for (const key of filterKeys) {
    const options = [...tally[key]].map(([value, count]) => ({
      value,
      count,
      disabled: count === 0 && value !== chosen[key],
    }));
    result[key] = {
      selected: chosen[key],
      total: total[key],
      visible:
        chosen[key] !== "" ||
        (key === "district"
          ? (universe.districtSplits.get(chosen.county) ?? false)
          : universe.splits[key]),
      options,
    };
  }
  return result;
}

interface MatchContext {
  chosen: Record<FilterKey, string>;
  hitSet: Set<string> | null;
}

// 這筆景點是否符合文字命中與所有已選條件；skip 內的維度不看
function matchesAll(
  entry: ListEntry,
  { chosen, hitSet }: MatchContext,
  skip: readonly FilterKey[] = [],
  useHits = true,
) {
  if (useHits && hitSet && !hitSet.has(entry.id)) return false;
  return filterKeys.every(
    (key) =>
      skip.includes(key) ||
      !chosen[key] ||
      filters[key](entry).includes(chosen[key]),
  );
}

function contextOf(
  entries: readonly ListEntry[],
  input: Partial<Record<FilterKey, string>> & {
    hits?: readonly string[] | null;
  },
): MatchContext {
  return {
    chosen: normalizeFilters(entries, input).chosen,
    hitSet: input.hits ? new Set(input.hits) : null,
  };
}

// 選了年齡帶時，其他條件都符合、但年齡未標示而未列入的筆數；沒選年齡帶為 0
export function ageUnknownCount(
  entries: readonly ListEntry[],
  input: Partial<Record<FilterKey, string>> & {
    hits?: readonly string[] | null;
  },
) {
  const context = contextOf(entries, input);
  if (!context.chosen.age) return 0;
  let count = 0;
  for (const entry of entries)
    if (!entry.age && matchesAll(entry, context, ["age"])) count++;
  return count;
}

export type RemovableKey = FilterKey | "query";
export interface RemovalOption {
  key: RemovableKey;
  // 條件的值（文字查詢則是查詢字串）
  value: string;
  // 拿掉這項條件（cleared 內的全部）後剩幾筆，其他條件與文字命中不變
  count: number;
  // 一起被拿掉的條件：改縣市會清掉行政區
  cleared: RemovableKey[];
}

// 無結果時逐項列出已選條件與「移除後可得 N 筆」。順序：文字查詢、再依 filterKeys。
// 文字查詢只有在確實有命中資料（hits 非 null）時才算條件；搜尋失敗時它沒有作用，不列。
// 拿掉文字查詢等於不套用 hits，只剩篩選條件。
export function removalOptions(
  entries: readonly ListEntry[],
  input: Partial<Record<FilterKey, string>> & {
    query?: string;
    hits?: readonly string[] | null;
  },
): RemovalOption[] {
  const context = contextOf(entries, input);
  const count = (skip: readonly FilterKey[], useHits = true) => {
    let total = 0;
    for (const entry of entries)
      if (matchesAll(entry, context, skip, useHits)) total++;
    return total;
  };
  const options: RemovalOption[] = [];
  if (input.query && context.hitSet)
    options.push({
      key: "query",
      value: input.query,
      count: count([], false),
      cleared: ["query"],
    });
  for (const key of filterKeys) {
    if (!context.chosen[key]) continue;
    const cleared: FilterKey[] =
      key === "county" ? ["county", "district"] : [key];
    options.push({
      key,
      value: context.chosen[key],
      count: count(cleared),
      cleared,
    });
  }
  return options;
}

export function queryList(
  entries: readonly ListEntry[],
  input: ListQueryInput,
): ListQueryResult {
  const { chosen, changed } = normalizeFilters(entries, input);
  let needsUrlReplace = changed;

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
