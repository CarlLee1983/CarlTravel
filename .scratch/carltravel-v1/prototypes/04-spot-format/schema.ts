// PROTOTYPE：票 04「景點內容檔的格式」的 zod schema 草案，只作討論素材，不是正式程式碼。
// 正式版會改用 astro/zod，並拆成多個檔案；這裡為了方便閱讀全部放在同一個檔案。
import { z } from "zod";

const nonEmpty = z.string().trim().min(1);
const isoDate = z.coerce.date();
const httpUrl = z.string().url().regex(/^https?:\/\//);

/** 景點 id 就是資料夾名稱，也是網址 slug。只能用小寫 ASCII 單字，以連字號連接。 */
export const SPOT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 22 個直轄市與縣市，一律使用官方寫法「臺」。 */
export const COUNTIES = [
  "臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市",
  "基隆市", "新竹市", "嘉義市",
  "新竹縣", "苗栗縣", "彰化縣", "南投縣", "雲林縣", "嘉義縣", "屏東縣",
  "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣",
] as const;

// ── 出處 ────────────────────────────────────────────────
// 「來源」依 CONTEXT.md 指 Carl 貼來的旅遊網址；官方網頁另稱「官方出處」，兩者分開列出。

const officialRef = z.object({
  id: nonEmpty, // 檔內參照用的短 id，例如 site、county-tourism
  title: nonEmpty,
  url: httpUrl,
  publisher: nonEmpty, // 經營者或機關名稱；引用政府開放資料時必須標示提供機關
});

const source = z.object({
  id: nonEmpty,
  title: nonEmpty,
  url: httpUrl,
  author: nonEmpty, // 作者或網站名稱
  readAt: isoDate,
  readable: z.boolean().default(true), // false 時，公開頁顯示「原文無法讀取」
});

// ── 官方資訊：逐條附出處 ─────────────────────────────────

const officialFact = z.discriminatedUnion("status", [
  // 有公布：一個值、一個出處
  z.object({ status: z.literal("ok"), label: nonEmpty, value: nonEmpty, ref: nonEmpty }),
  // 官方未公布
  z.object({ status: z.literal("unpublished"), label: nonEmpty }),
  // 資料不一致：並列各方說法，並附「出發前請洽 X」
  z.object({
    status: z.literal("conflict"),
    label: nonEmpty,
    claims: z.array(z.object({ value: nonEmpty, ref: nonEmpty })).min(2),
    contact: nonEmpty,
  }),
]);

const officialSection = z.object({
  checkedAt: isoDate, // 分節查證日期；超過 12 個月時，build 會標示「資料可能過期」
  facts: z.array(officialFact).min(1),
});

// ── 親子與無障礙清單：只能填有、無、未知 ─────────────────

const checkItem = z.discriminatedUnion("value", [
  z.object({ value: z.literal("unknown") }),
  z.object({ value: z.literal("yes"), ref: nonEmpty, note: nonEmpty.optional() }),
  z.object({ value: z.literal("no"), ref: nonEmpty, note: nonEmpty.optional() }),
]);

const familyChecklist = z.object({
  checkedAt: isoDate,
  stroller: checkItem.default({ value: "unknown" }), // 推車友善
  nursingRoom: checkItem.default({ value: "unknown" }), // 哺乳室
  familyRestroom: checkItem.default({ value: "unknown" }), // 親子廁所
  rainyDay: checkItem.default({ value: "unknown" }), // 雨天備案
  ageRange: checkItem.default({ value: "unknown" }), // 建議年齡：note 寫年齡範圍（待決定）
  accessibility: checkItem.default({ value: "unknown" }), // 無障礙設施
  notes: nonEmpty.optional(), // 清單以外的自由文字
});

// ── 非官方內容 ──────────────────────────────────────────

const authorNote = z.object({
  source: nonEmpty, // 對應 sources[].id
  summary: nonEmpty, // 轉述摘要，不逐句換字
  quotes: z.array(nonEmpty.max(60)).max(2).default([]), // 每段約 50 字（上限放寬到 60 字），每個來源最多兩段
});

const withKids = z.object({
  facts: z.array(z.object({ text: nonEmpty, ref: nonEmpty })).default([]), // 事實要附出處
  activities: z.array(nonEmpty).default([]), // 觀察活動，屬於 Agent 建議
});

const nearby = z.object({
  name: nonEmpty,
  kind: z.enum(["food", "stay", "activity"]),
  note: nonEmpty,
  source: nonEmpty.optional(),
});

// ── 景點 ────────────────────────────────────────────────

export const spotSchema = z
  .object({
    name: nonEmpty, // 官方名稱
    address: nonEmpty,
    county: z.enum(COUNTIES),
    district: nonEmpty, // 鄉鎮市區，不設值域，交給 check:content 比對官方行政區清單
    location: z.object({ lat: z.number(), lng: z.number() }).optional(), // 用來產生 Google Maps URLs／OSM 連結
    tourismId: nonEmpty.optional(), // 觀光署開放資料 ID，只用來定位景點
    summary: nonEmpty,
    tags: z.array(nonEmpty).default([]), // 值域待票 07 決定

    officialRefs: z.array(officialRef).min(1),
    sources: z.array(source).min(1),

    official: z.object({
      transport: officialSection, // 交通與停車
      hoursAndFees: officialSection, // 開放時間與費用
      facilities: officialSection.optional(), // 親子設施的官方說明（清單以外）
    }),
    familyChecklist,

    authorNotes: z.array(authorNote).default([]),
    agentTips: z.array(nonEmpty).default([]),
    withKids: withKids.optional(),
    nearby: z.array(nearby).default([]),
  })
  .superRefine((spot, ctx) => {
    // 所有 ref 都必須指向已宣告的官方出處，所有 source 都必須指向已宣告的來源
    const officialIds = new Set(spot.officialRefs.map((r) => r.id));
    const sourceIds = new Set(spot.sources.map((s) => s.id));
    const refs: Array<[string, (string | number)[]]> = [];
    for (const [key, section] of Object.entries(spot.official)) {
      section?.facts.forEach((fact, i) => {
        if (fact.status === "ok") refs.push([fact.ref, ["official", key, "facts", i, "ref"]]);
        if (fact.status === "conflict")
          fact.claims.forEach((c, j) => refs.push([c.ref, ["official", key, "facts", i, "claims", j, "ref"]]));
      });
    }
    for (const [key, item] of Object.entries(spot.familyChecklist)) {
      if (typeof item === "object" && "ref" in item) refs.push([item.ref, ["familyChecklist", key, "ref"]]);
    }
    spot.withKids?.facts.forEach((f, i) => refs.push([f.ref, ["withKids", "facts", i, "ref"]]));
    for (const [ref, path] of refs) {
      if (!officialIds.has(ref)) ctx.addIssue({ code: "custom", path, message: `未宣告的官方出處：${ref}` });
    }
    spot.authorNotes.forEach((n, i) => {
      if (!sourceIds.has(n.source)) ctx.addIssue({ code: "custom", path: ["authorNotes", i, "source"], message: `未宣告的來源：${n.source}` });
    });
  });

export type Spot = z.infer<typeof spotSchema>;
