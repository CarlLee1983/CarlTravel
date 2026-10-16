// 列表 JSON 的編碼與解碼。瀏覽器端用 decodeList，所以此檔不得引用 node 模組。
// 形狀：{ fields: 欄位名稱, rows: 與 fields 同順序的位置陣列 }。
import { compareListOrder } from "./list-order.ts";
import type { Spot } from "./schema.ts";

export const listFields = [
  "id",
  "name",
  "county",
  "district",
  "kind",
  "setting",
  "summary",
  "illustration",
  "age",
  "family",
  "checkedAt",
  "status",
] as const;

// 五項親子條件的固定順序；每位數字 0 = 未知、1 = 有、2 = 無
export const familyKeys = [
  "stroller",
  "nursingRoom",
  "familyToilet",
  "rainyDay",
  "accessibility",
] as const;
const familyStates = ["unknown", "yes", "no"] as const;
export type FamilyState = (typeof familyStates)[number];

export const illustrationHashLength = 16;

export interface ListData {
  fields: readonly string[];
  rows: unknown[][];
}
export interface ListEntry {
  id: string;
  name: string;
  county: Spot["county"];
  district: string;
  kind: Spot["kind"];
  setting: Spot["setting"];
  summary: string;
  illustration: { hash: string; alt: string } | null;
  age: { min: number; max: number | null } | null;
  family: Record<(typeof familyKeys)[number], FamilyState>;
  checkedAt: string;
  // 結構化營運狀態尚無資料，先預留欄位
  status: null;
}

// rows 依最終列表順序排好（見 list-order.ts），解碼後直接是列表順序
export function encodeList(spots: readonly Spot[]): ListData {
  const rows = [...spots]
    .sort(compareListOrder)
    .map((spot) => [
      spot.id,
      spot.name,
      spot.county,
      spot.district,
      spot.kind,
      spot.setting,
      spot.summary,
      spot.illustration
        ? [
            spot.illustration.sha256.slice(0, illustrationHashLength),
            spot.illustration.alt,
          ]
        : null,
      spot.ageRange.status === "known"
        ? [spot.ageRange.min, spot.ageRange.max ?? null]
        : null,
      familyKeys
        .map((key) =>
          familyStates.indexOf(spot.familyChecklist[key].status as FamilyState),
        )
        .join(""),
      spot.familyChecklist.checkedAt,
      null,
    ]);
  return { fields: listFields, rows };
}

export function decodeList(data: ListData): ListEntry[] {
  if (JSON.stringify(data.fields) !== JSON.stringify(listFields))
    throw new Error("列表 JSON 欄位表頭不符");
  return data.rows.map((row) => {
    if (row.length !== listFields.length)
      throw new Error("列表 JSON 列長度與欄位數不符");
    const [
      id,
      name,
      county,
      district,
      kind,
      setting,
      summary,
      illustration,
      age,
      family,
      checkedAt,
      status,
    ] = row as [
      string,
      string,
      ListEntry["county"],
      string,
      ListEntry["kind"],
      ListEntry["setting"],
      string,
      [string, string] | null,
      [number, number | null] | null,
      string,
      string,
      null,
    ];
    if (!/^[012]{5}$/.test(family))
      throw new Error("親子條件編碼不是 5 位數字");
    return {
      id,
      name,
      county,
      district,
      kind,
      setting,
      summary,
      illustration: illustration
        ? { hash: illustration[0], alt: illustration[1] }
        : null,
      age: age ? { min: age[0], max: age[1] } : null,
      family: Object.fromEntries(
        familyKeys.map((key, index) => [
          key,
          familyStates[Number(family[index])]!,
        ]),
      ) as ListEntry["family"],
      checkedAt,
      status,
    };
  });
}
