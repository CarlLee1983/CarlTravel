import { z } from "zod";
import districts from "../data/districts.json" with { type: "json" };

import { counties } from "./counties.ts";

export { counties };
const quotedText = z
  .string()
  .trim()
  .min(1)
  .refine(
    (v) => !/!\[[^\]]*\]|<\s*(?:img|picture|svg|image)\b/i.test(v),
    "景點內容不得包含圖片",
  );
const text = quotedText.refine(
  (v) => !v.includes("我"),
  "引文之外不得使用第一人稱（我／我們）",
);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v);
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "無效日期");
const url = z
  .url()
  .refine(
    (v) => ["https:", "http:"].includes(new URL(v).protocol),
    "網址必須使用 HTTP(S)",
  );
const ref = text;
const fact = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), label: text, value: text, ref }).strict(),
  z.object({ status: z.literal("unpublished"), label: text }).strict(),
  z
    .object({
      status: z.literal("conflict"),
      label: text,
      claims: z
        .array(z.object({ value: text, ref }).strict())
        .min(2)
        .refine(
          (claims) =>
            new Set(claims.map((c) => c.ref)).size >= 2 &&
            new Set(claims.map((c) => c.value)).size >= 2,
          "衝突必須有至少兩種不同說法與不同出處",
        ),
      contact: text,
    })
    .strict(),
]);
const section = z
  .object({ checkedAt: date, facts: z.array(fact).min(1) })
  .strict();
const checklistItem = z
  .discriminatedUnion("status", [
    z.object({ status: z.literal("unknown") }).strict(),
    z
      .object({ status: z.enum(["yes", "no"]), ref, note: text.optional() })
      .strict(),
  ])
  .default({ status: "unknown" });
export const spotSchema = z
  .object({
    name: text,
    address: text,
    county: z.enum(counties),
    district: text,
    kind: z.enum([
      "公園",
      "博物館",
      "農場",
      "步道",
      "老街",
      "觀光工廠",
      "動物園／水族館",
      "其他",
    ]),
    setting: z.enum(["室內", "戶外", "室內外皆有"]),
    summary: text.refine((v) => [...v].length <= 30, "摘要最多 30 字"),
    illustration: z
      .object({
        kind: z.literal("ai-generated"),
        alt: text,
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        width: z.number().int().positive().max(4096),
        height: z.number().int().positive().max(4096),
      })
      .strict()
      .optional(),
    ageRange: z.discriminatedUnion("status", [
      z.object({ status: z.literal("unknown") }).strict(),
      z
        .object({
          status: z.literal("known"),
          min: z.number().int().nonnegative(),
          max: z.number().int().nonnegative().optional(),
          ref,
        })
        .strict()
        .refine(
          (v) => v.max === undefined || v.max >= v.min,
          "年齡上限不得小於下限",
        ),
    ]),
    tourismId: z.object({ value: text, ref }).strict().optional(),
    officialRefs: z
      .array(
        z.discriminatedUnion("kind", [
          z
            .object({
              id: text,
              title: text,
              url,
              organization: text,
              kind: z.literal("page"),
            })
            .strict(),
          z
            .object({
              id: text,
              title: text,
              url,
              organization: text,
              kind: z.literal("openData"),
              purpose: z.enum(["positioning", "facts"]),
              attribution: z
                .object({
                  provider: text,
                  year: z.number().int().min(1).max(9999),
                  dataset: text,
                  version: text,
                })
                .strict(),
            })
            .strict(),
        ]),
      )
      .min(1),
    sources: z
      .array(
        z
          .object({
            id: text,
            title: text,
            url,
            author: text,
            readAt: date,
            readable: z.boolean(),
          })
          .strict(),
      )
      .default([]),
    authorNotes: z
      .array(
        z
          .object({
            source: ref,
            summary: text,
            quotes: z
              .array(
                quotedText.refine((v) => [...v].length <= 60, "引文最多 60 字"),
              )
              .default([]),
          })
          .strict(),
      )
      .default([]),
    facilities: section.optional(),
    withKids: z
      .object({
        checkedAt: date,
        facts: z.array(z.object({ text, ref }).strict()).min(1),
        activities: z.array(text).default([]),
      })
      .strict()
      .optional(),
    agentTips: z.array(text).default([]),
    nearby: z
      .array(
        z
          .object({
            name: text,
            kind: z.enum(["food", "stay", "activity"]),
            note: text,
            source: ref.optional(),
          })
          .strict(),
      )
      .default([]),
    location: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .strict()
      .optional(),
    transport: section,
    hoursAndFees: section,
    familyChecklist: z
      .object({
        checkedAt: date,
        stroller: checklistItem,
        nursingRoom: checklistItem,
        familyToilet: checklistItem,
        rainyDay: checklistItem,
        accessibility: checklistItem,
        notes: text.optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((spot, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    if (!districts[spot.county].includes(spot.district))
      issue(["district"], "行政區不屬於指定縣市");
    const ids = new Set<string>();
    const used = new Set<string>();
    spot.officialRefs.forEach((r, i) => {
      if (ids.has(r.id)) issue(["officialRefs", i, "id"], "出處 id 重複");
      ids.add(r.id);
    });
    function use(r: string, path: (string | number)[]) {
      if (!ids.has(r)) issue(path, "官方出處參照不存在");
      const reference = spot.officialRefs.find((item) => item.id === r);
      if (reference?.kind === "openData" && reference.purpose === "positioning")
        issue(path, "此開放資料只用定位，不得代替官方事實查證");
      used.add(r);
    }
    if (spot.tourismId) {
      if (!ids.has(spot.tourismId.ref))
        issue(["tourismId", "ref"], "官方出處參照不存在");
      used.add(spot.tourismId.ref);
      const reference = spot.officialRefs.find(
        (r) => r.id === spot.tourismId!.ref,
      );
      if (reference?.kind !== "openData" || reference.purpose !== "positioning")
        issue(["tourismId", "ref"], "定位 ID 必須參照含顯名的定位用途開放資料");
    }
    if (spot.ageRange.status === "known")
      use(spot.ageRange.ref, ["ageRange", "ref"]);
    for (const key of ["transport", "hoursAndFees", "facilities"] as const)
      spot[key]?.facts.forEach((f, i) => {
        if (f.status === "ok") use(f.ref, [key, "facts", i, "ref"]);
        if (f.status === "conflict")
          f.claims.forEach((c, j) =>
            use(c.ref, [key, "facts", i, "claims", j, "ref"]),
          );
      });
    for (const key of [
      "stroller",
      "nursingRoom",
      "familyToilet",
      "rainyDay",
      "accessibility",
    ] as const) {
      const item = spot.familyChecklist[key];
      if (item.status !== "unknown")
        use(item.ref, ["familyChecklist", key, "ref"]);
    }
    spot.withKids?.facts.forEach((f, i) =>
      use(f.ref, ["withKids", "facts", i, "ref"]),
    );
    spot.nearby.forEach((item, i) => {
      if (item.source && !spot.sources.some((s) => s.id === item.source))
        issue(["nearby", i, "source"], "來源參照不存在");
    });
    spot.officialRefs.forEach((r, i) => {
      if (!used.has(r.id)) issue(["officialRefs", i], "未使用的官方出處");
    });
    const quoteCounts = new Map<string, number>();
    spot.authorNotes.forEach((note, i) => {
      const count = (quoteCounts.get(note.source) ?? 0) + note.quotes.length;
      quoteCounts.set(note.source, count);
      if (count > 2) issue(["authorNotes", i, "quotes"], "每來源最多兩段引文");
      const source = spot.sources.find((s) => s.id === note.source);
      if (!source) issue(["authorNotes", i, "source"], "來源參照不存在");
      else if (!source.readable)
        issue(["authorNotes", i, "source"], "不可讀來源不得產生心得或引文");
    });
    const sourceIds = new Set<string>();
    spot.sources.forEach((s, i) => {
      if (sourceIds.has(s.id)) issue(["sources", i, "id"], "來源 id 重複");
      sourceIds.add(s.id);
      if (
        s.readable &&
        !spot.authorNotes.some((note) => note.source === s.id) &&
        !spot.nearby.some((item) => item.source === s.id)
      )
        issue(["sources", i], "未使用的來源");
    });
  });
export type SpotData = z.infer<typeof spotSchema>;
export type Spot = SpotData & { id: string };
export function ageLabel(age: SpotData["ageRange"]) {
  return age.status === "unknown"
    ? "年齡未標示"
    : age.max === undefined
      ? `${age.min} 歲以上`
      : `${age.min}–${age.max} 歲`;
}
