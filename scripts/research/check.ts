import { join } from "node:path";
import { readdir } from "node:fs/promises";
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
import { officialRecords, readOfficial } from "./official.ts";
import type { Spot } from "../../src/content/schema.ts";

type Status = "pass" | "fail" | "not_run_approved_unreadable";
export interface ResearchResult {
  ok: boolean;
  sources: { id: string; original: Status; notes: "pass" | "fail" }[];
  officialOnly: {
    id: string;
    original: "not_applicable";
    notes: "pass" | "fail";
  }[];
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
    officialOnly: [],
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
      return spot;
    });
    const texts = spots.flatMap((spot) =>
      fields(spot).map((field) => ({ ...field, spot: spot.id })),
    );
    const officialSpots = spots.filter((spot) => !spot.sources.length);
    for (const spot of officialSpots) {
      result.officialOnly.push({
        id: spot.id,
        original: "not_applicable",
        notes: "fail",
      });
      await readOfficial(root, spot.id, true);
    }
    // Official-only research still carries private instructions, including notes
    // from other local batches. Never use an empty sources array to skip them.
    for (const record of await officialRecords(root)) {
      for (const field of texts) {
        const hit = overlap(
          record.notes === "無" ? "" : record.notes,
          field.text,
        );
        if (hit) {
          result.ok = false;
          details.push(
            `${record.id}: 純官方私人備註命中 ${field.spot}.${field.path}: ${hit}`,
          );
        }
      }
    }
    if (result.ok) result.officialOnly.forEach((item) => (item.notes = "pass"));
    // Retained travel evidence remains relevant after a draft drops its source
    // references. This does not turn official pages into authored travel sources.
    if (officialSpots.length) {
      const retained = new Set(knownSources.map((source) => source.id));
      for (const entry of await readdir(research, { withFileTypes: true })) {
        if (entry.name === "official" || entry.name === "publish") continue;
        if (entry.isSymbolicLink()) throw new Error("研究紀錄不得是符號連結");
        if (entry.isDirectory()) {
          const dir = join(research, entry.name);
          const source = await readLocal(join(dir, "source.md"), true);
          if (source !== undefined) retained.add(entry.name);
          else if (
            (await readLocal(join(dir, "original.txt"), true)) !== undefined
          )
            throw new Error(`${entry.name}: 原文仍在但來源紀錄已遺失`);
        }
      }
      const officialTexts = texts.filter((field) =>
        officialSpots.some((spot) => spot.id === field.spot),
      );
      for (const id of retained) {
        const record = await readSource(root, id);
        const notes = section(record.text, "Carl 備註").value;
        if (!notes) throw new Error(`${id}: Carl 備註不可空白`);
        const original = await readLocal(
          join(record.dir, "original.txt"),
          true,
        );
        if (original === undefined && everObtained(record.text))
          throw new Error(`${id}: 原文曾取得但已遺失`);
        if (original !== undefined) {
          if (!original.trim()) throw new Error(`${id}: 原文檔為空`);
          await observeOriginal(record.dir, record.text, original);
        }
        for (const field of officialTexts) {
          const hit =
            overlap(notes === "無" ? "" : notes, field.text) ||
            (original && prose(field) && overlap(original, field.text));
          if (hit) {
            result.ok = false;
            details.push(
              `${id}: 保留來源命中 ${field.spot}.${field.path}: ${hit}`,
            );
          }
        }
      }
    }
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
  result.ok &&= result.officialOnly.every((spot) => spot.notes === "pass");
  await writeLocal(
    join(research, "overlap-report.md"),
    `# 本機重疊檢查\n\n時間：${new Date().toISOString()}\n結果：${result.ok ? "可送審（仍待 Carl 決定）" : "阻擋"}\n\n${result.sources.map((source) => `- ${source.id}: 原文 ${source.original}；備註 ${source.notes}`).join("\n")}\n${result.officialOnly.map((spot) => `- ${spot.id}: 未執行：純官方資料無旅遊原文（not_applicable）；備註 ${spot.notes}`).join("\n")}\n\n## 私人診斷（只留本機）\n${details.map((detail) => `- ${detail}`).join("\n") || "無"}\n`,
  );
  return result;
}
