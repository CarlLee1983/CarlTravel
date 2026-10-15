import { join } from "node:path";
import { readLocal, researchDirectory, validId, writeLocal } from "./files.ts";
import {
  allSpots,
  readSource,
  section,
  everObtained,
  approvedUnreadable,
  observeOriginal,
} from "./records.ts";
import { overlap } from "./overlap.ts";
import type { Spot } from "../../src/content/schema.ts";

type Status = "pass" | "fail" | "not_run_approved_unreadable";
export interface ResearchResult {
  ok: boolean;
  sources: { id: string; original: Status; notes: "pass" | "fail" }[];
  report: string;
}
function fields(value: unknown, path = ""): { path: string; text: string }[] {
  if (typeof value === "string") return [{ path, text: value }];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, item]) =>
    fields(item, path ? `${path}.${key}` : key),
  );
}
function prose(field: { path: string }) {
  return (
    !/(?:^|\.)(?:id|ref|source|url)$/.test(field.path) &&
    !/^authorNotes\.\d+\.quotes\.\d+$/.test(field.path)
  );
}
export async function checkResearch(
  root: string,
  ids: string[],
): Promise<ResearchResult> {
  const research = await researchDirectory(root);
  const result: ResearchResult = {
    ok: true,
    sources: [],
    report: "research/overlap-report.md",
  };
  const details: string[] = [];
  try {
    if (!ids.length || new Set(ids).size !== ids.length)
      throw new Error("指定至少一個不重複的草稿 id");
    ids.forEach(validId);
    const { formal, drafts } = await allSpots(root);
    const knownSources = [...formal, ...drafts].flatMap((spot) => spot.sources);
    const spots = ids.map((id) => {
      const spot = drafts.find((item) => item.id === id);
      if (!spot) throw new Error(`${id}: 找不到指定草稿`);
      if (!spot.sources.length) throw new Error(`${id}: 研究草稿缺少來源參照`);
      return spot;
    });
    const texts = spots.flatMap((spot) =>
      fields(spot).map((field) => ({ ...field, spot: spot.id })),
    );
    const sources = new Map<string, Spot["sources"][number]>();
    for (const source of spots.flatMap((spot) => spot.sources)) {
      const previous = sources.get(source.id);
      if (previous && JSON.stringify(previous) !== JSON.stringify(source))
        throw new Error(`${source.id}: 同 id 的來源資訊不一致`);
      sources.set(source.id, source);
    }
    for (const source of sources.values()) {
      const status: ResearchResult["sources"][number] = {
        id: source.id,
        original: "fail",
        notes: "fail",
      };
      result.sources.push(status);
      try {
        if (
          knownSources.some(
            (known) =>
              known.id === source.id &&
              (known.url !== source.url || known.readAt !== source.readAt),
          )
        )
          throw new Error("同 id 的來源指向不同網址或讀取日期");
        const record = await readSource(root, source.id);
        if (
          section(record.text, "網址").value !== source.url ||
          section(record.text, "讀取日期").value !== source.readAt
        )
          throw new Error("公開來源與本機紀錄的網址／讀取日期不一致");
        const notes = section(record.text, "Carl 備註").value;
        if (!notes) throw new Error("Carl 備註必須保留，沒有備註請填無");
        status.notes = "pass";
        for (const field of texts) {
          const hit = overlap(notes === "無" ? "" : notes, field.text);
          if (hit) {
            status.notes = "fail";
            details.push(
              `${source.id}: 私人備註命中 ${field.spot}.${field.path}: ${hit}`,
            );
          }
        }
        const original = await readLocal(
          join(record.dir, "original.txt"),
          true,
        );
        if (original === undefined && everObtained(record.text))
          throw new Error("原文曾取得但已遺失，恢復 original.txt 後重跑");
        if (!source.readable && !approvedUnreadable(record.text))
          throw new Error("不可讀來源缺少完整讀取嘗試與 Carl 核准紀錄");
        if (original === undefined) {
          if (source.readable) throw new Error("可讀來源缺少原文");
          status.original = "not_run_approved_unreadable";
          continue;
        }
        if (!original.trim()) throw new Error("原文檔為空，不得套用未執行例外");
        await observeOriginal(record.dir, record.text, original);
        status.original = "pass";
        for (const field of texts.filter(prose)) {
          const hit = overlap(original, field.text);
          if (hit) {
            status.original = "fail";
            details.push(
              `${source.id}: 原文命中 ${field.spot}.${field.path}: ${hit}`,
            );
          }
        }
      } catch (error) {
        details.push(
          `${source.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  } catch (error) {
    result.ok = false;
    details.push(error instanceof Error ? error.message : String(error));
  }
  result.ok &&= result.sources.every(
    (source) => source.original !== "fail" && source.notes === "pass",
  );
  await writeLocal(
    join(research, "overlap-report.md"),
    `# 本機重疊檢查\n\n時間：${new Date().toISOString()}\n結果：${result.ok ? "可送審（仍待 Carl 決定）" : "阻擋"}\n\n${result.sources.map((source) => `- ${source.id}: 原文 ${source.original}；備註 ${source.notes}`).join("\n")}\n\n## 私人診斷（只留本機）\n${details.map((detail) => `- ${detail}`).join("\n") || "無"}\n`,
  );
  return result;
}
