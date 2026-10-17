// 景點頁的文案邏輯：「出發前確認」卡的列、章節清單與提要、親子清單的已知／未知分組。
// 純函式，不依賴 Astro，單元測試直接驗證文案。
import { ageLabel, type Spot } from "./schema.ts";

type Section = Spot["hoursAndFees"];
type Fact = Section["facts"][number];

// 結構化營運狀態（H-15）：資料基礎尚未提供欄位，頁面目前傳入 null。
// 有值就視為異動（深色強調）；closed 為休園，地圖降級為文字連結。
export interface OperatingStatus {
  text: string;
  closed: boolean;
}

export interface PreDepartureRow {
  label: string;
  value: string;
  to: string;
  strong: boolean;
}

export const checklistKeys = [
  ["stroller", "推車友善"],
  ["nursingRoom", "哺乳室"],
  ["familyToilet", "親子廁所"],
  ["rainyDay", "雨天備案"],
  ["accessibility", "無障礙設施"],
] as const;

// 和列表卡片一致：否定寫「沒有」
export const statusText = { yes: "有", no: "沒有", unknown: "未知" } as const;

const isFee = (label: string) => /費|票/.test(label);
const factText = (fact: Fact) =>
  fact.status === "ok"
    ? fact.value
    : fact.status === "unpublished"
      ? "官方未公布"
      : "官方資訊有衝突";

export function checklistEntries(spot: Spot) {
  return checklistKeys.map(([key, label]) => ({
    key,
    label,
    item: spot.familyChecklist[key],
  }));
}

// 可向誰確認：第一個官方頁面出處的機關，沒有頁面出處時退回第一筆
export function contactRef(spot: Pick<Spot, "officialRefs">) {
  return (
    spot.officialRefs.find((ref) => ref.kind === "page") ?? spot.officialRefs[0]
  );
}

export function checklistView(spot: Spot) {
  const entries = checklistEntries(spot);
  return {
    known: entries.filter((entry) => entry.item.status !== "unknown"),
    unknown: entries.filter((entry) => entry.item.status === "unknown"),
    age: spot.ageRange.status === "known" ? ageLabel(spot.ageRange) : null,
    contact: contactRef(spot),
  };
}

export function feeFact(spot: Spot) {
  return spot.hoursAndFees.facts.find((fact) => isFee(fact.label));
}

function conflicts(spot: Spot) {
  return (
    [
      ["hours", spot.hoursAndFees],
      ["transport", spot.transport],
      ...(spot.facilities ? [["facilities", spot.facilities] as const] : []),
    ] as const
  ).flatMap(([id, section]) =>
    section.facts
      .filter((fact) => fact.status === "conflict")
      .map((fact) => ({ id: id as string, label: fact.label })),
  );
}

export function preDepartureRows(
  spot: Spot,
  status: OperatingStatus | null,
): PreDepartureRow[] {
  const hours = spot.hoursAndFees.facts.find((fact) => !isFee(fact.label));
  const fee = feeFact(spot);
  const { known } = checklistView(spot);
  const conflictList = conflicts(spot);
  return [
    {
      label: "營運狀態",
      value: status?.text ?? "未記錄異動，出發前請看官方公告",
      to: "references",
      strong: status !== null,
    },
    {
      label: "開放時間",
      value: hours ? factText(hours) : "尚未整理",
      to: "hours",
      strong: false,
    },
    {
      label: "費用",
      value: fee ? factText(fee) : "尚未整理，未列出不代表免費",
      to: "hours",
      strong: false,
    },
    ...(conflictList.length
      ? [
          {
            label: "資訊衝突",
            value: `${conflictList.map((c) => c.label).join("、")}：官方資訊有衝突`,
            to: conflictList[0]!.id,
            strong: true,
          },
        ]
      : []),
    {
      label: "親子條件",
      value: known.length
        ? `已知 ${known.length}／${checklistKeys.length} 項`
        : "尚未整理（未知不代表沒有）",
      to: "checklist",
      strong: false,
    },
    {
      label: "建議年齡",
      value:
        spot.ageRange.status === "known" ? ageLabel(spot.ageRange) : "未標示",
      to: "checklist",
      strong: false,
    },
  ];
}

export function mapMode(status: OperatingStatus | null): "buttons" | "quiet" {
  return status?.closed ? "quiet" : "buttons";
}

export type SectionTag = "official" | "author" | "agent";
export interface SectionEntry {
  id: string;
  label: string;
  gist: string;
  tag?: SectionTag;
  checkedAt?: string;
  // 資料沒有的官方章節：列成不能展開的「尚未整理」，而不是省略
  missing: boolean;
}

const factsGist = (section: Section) =>
  [
    section.facts.some((fact) => fact.status === "conflict") && "有衝突",
    section.facts.map((fact) => fact.label).join("、"),
  ]
    .filter(Boolean)
    .join(" · ");

export function sectionEntries(
  spot: Spot,
  transportTitle: string,
): SectionEntry[] {
  const known = checklistView(spot).known.length;
  const hoursGist = [
    spot.hoursAndFees.facts.some((fact) => fact.status === "conflict") &&
      "有衝突",
    !feeFact(spot) && "費用尚未整理",
  ]
    .filter(Boolean)
    .join(" · ");
  return [
    {
      id: "checklist",
      label: "親子清單",
      gist: known ? `已知 ${known}／${checklistKeys.length} 項` : "尚未整理",
      tag: "official",
      checkedAt: spot.familyChecklist.checkedAt,
      missing: false,
    },
    {
      id: "hours",
      label: "開放時間與費用",
      gist: hoursGist || factsGist(spot.hoursAndFees),
      tag: "official",
      checkedAt: spot.hoursAndFees.checkedAt,
      missing: false,
    },
    {
      id: "transport",
      label: transportTitle,
      gist: factsGist(spot.transport),
      tag: "official",
      checkedAt: spot.transport.checkedAt,
      missing: false,
    },
    spot.facilities
      ? {
          id: "facilities",
          label: "設施",
          gist: factsGist(spot.facilities),
          tag: "official",
          checkedAt: spot.facilities.checkedAt,
          missing: false,
        }
      : { id: "facilities", label: "設施", gist: "", missing: true },
    spot.withKids
      ? {
          id: "with-kids",
          label: "跟孩子一起看",
          gist: `${spot.withKids.facts.length} 項`,
          tag: "official",
          checkedAt: spot.withKids.checkedAt,
          missing: false,
        }
      : { id: "with-kids", label: "跟孩子一起看", gist: "", missing: true },
    ...(spot.authorNotes.length
      ? [
          {
            id: "author",
            label: "原作者心得",
            gist: `${spot.authorNotes.length} 則`,
            tag: "author" as const,
            missing: false,
          },
        ]
      : []),
    ...(spot.agentTips.length
      ? [
          {
            id: "tips",
            label: "Agent 建議",
            gist: `${spot.agentTips.length} 則`,
            tag: "agent" as const,
            missing: false,
          },
        ]
      : []),
    ...(spot.nearby.length
      ? [
          {
            id: "nearby",
            label: "周邊安排",
            gist: `${spot.nearby.length} 處`,
            missing: false,
          },
        ]
      : []),
    {
      id: "references",
      label: "來源與官方出處",
      gist: `${spot.officialRefs.length + spot.sources.length} 筆`,
      missing: false,
    },
  ];
}
