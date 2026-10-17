// 列表卡片的檢視模型：靜態頁（Astro）與日後由列表 JSON 在瀏覽器端產生的卡片共用，
// 所以此檔只吃 ListEntry、不得引用 node 模組（thumbnail.ts 會引入 sharp，不能 import）。
import { familyKeys, type ListEntry } from "./list.ts";

// 縮圖尺寸與版本由此檔持有（瀏覽器端也要用），thumbnail.ts 再匯出給建置端。
export const thumbnailWidth = 336;
export const thumbnailHeight = 224;
export const thumbnailVersion = "landscape-v2";
export const thumbnailUrl = (id: string) => `/spot-thumbnails/${id}.webp`;

const familyLabels: Record<(typeof familyKeys)[number], string> = {
  stroller: "推車友善",
  nursingRoom: "哺乳室",
  familyToilet: "親子廁所",
  rainyDay: "雨天備案",
  accessibility: "無障礙",
};

export interface CardTag {
  text: string;
  negative: boolean;
}
export interface CardView {
  id: string;
  href: string;
  name: string;
  meta: string;
  // 結構化營運狀態；目前資料沒有，只在有值時顯示，不從摘要推定
  status: string | null;
  summary: string;
  thumbnail: {
    src: string;
    alt: string;
    width: number;
    height: number;
  } | null;
  tags: CardTag[];
  note: string;
}

function ageText(age: NonNullable<ListEntry["age"]>) {
  return age.max === null ? `${age.min} 歲以上` : `${age.min}–${age.max} 歲`;
}

export function cardView(entry: ListEntry): CardView {
  const knownKeys = familyKeys.filter((key) => entry.family[key] !== "unknown");
  const unknownCount = familyKeys.length - knownKeys.length;
  const tags: CardTag[] = [
    ...(entry.age ? [{ text: ageText(entry.age), negative: false }] : []),
    ...knownKeys.map((key) => ({
      text: `${familyLabels[key]}：${entry.family[key] === "yes" ? "有" : "沒有"}`,
      negative: entry.family[key] === "no",
    })),
  ];
  const unknownParts = [
    ...(unknownCount > 0 ? [`另有 ${unknownCount} 項親子條件未知`] : []),
    ...(entry.age ? [] : ["年齡未標示"]),
  ];
  const note =
    tags.length === 0
      ? "親子條件與年齡尚未整理，未知不代表沒有"
      : unknownParts.length === 0
        ? `親子條件查證 ${entry.checkedAt}`
        : `${unknownParts.join("、")} · 查證 ${entry.checkedAt}`;
  return {
    id: entry.id,
    href: `/spots/${entry.id}/`,
    name: entry.name,
    meta: `${entry.county} ${entry.district} · ${entry.kind} · ${entry.setting}`,
    status: entry.status,
    summary: entry.summary,
    thumbnail: entry.illustration
      ? {
          src: `${thumbnailUrl(entry.id)}?v=${thumbnailVersion}-${entry.illustration.hash}`,
          alt: entry.illustration.alt,
          width: thumbnailWidth,
          height: thumbnailHeight,
        }
      : null,
    tags,
    note,
  };
}
