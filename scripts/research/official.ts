import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  directory,
  readLocal,
  researchDirectory,
  validDate,
  validId,
  writeLocal,
} from "./files.ts";
import { reviewHeadings, section } from "./records.ts";

const headings = [
  "景點 id",
  "查證日期",
  "Carl 備註",
  "Carl 勾選日期",
  "Carl 勾選",
];

export async function initOfficial(
  root: string,
  date: string,
  id: string,
  notes: string,
) {
  validDate(date);
  validId(id);
  if (!notes.trim()) throw new Error("備註不可空白，沒有備註請填無");
  const base = join(await researchDirectory(root), "official");
  await directory(base, true);
  const dir = join(base, id);
  await directory(dir, true);
  const values = [
    id,
    date,
    notes
      .trim()
      .split(/\r?\n/)
      .map((line) => `    ${line}`)
      .join("\n"),
    "未核准",
    "未核准",
  ];
  await writeLocal(
    join(dir, "record.md"),
    "# 純官方研究\n\n" +
      headings.map((heading, i) => `## ${heading}\n${values[i]}\n`).join("\n"),
    true,
  );
  await writeLocal(
    join(dir, "official-log.md"),
    "# 官方查證\n\n尚未查證。\n",
    true,
  );
  await writeLocal(
    join(dir, "review.md"),
    "# 送審清單\n\n" +
      reviewHeadings.map((heading) => `## ${heading}\n待完成\n`).join("\n"),
    true,
  );
}

export async function readOfficial(root: string, id: string, ready = false) {
  validId(id);
  const base = join(await researchDirectory(root), "official");
  await directory(base);
  const dir = join(base, id);
  await directory(dir);
  const text = (await readLocal(join(dir, "record.md")))!.replace(
    /\r\n/g,
    "\n",
  );
  if (
    [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]).join("|") !==
    headings.join("|")
  )
    throw new Error("純官方研究紀錄標題不完整");
  if (section(text, "景點 id").value !== id)
    throw new Error("純官方研究景點 id 不一致");
  const date = section(text, "查證日期").value;
  validDate(date);
  const notes = section(text, "Carl 備註").value;
  if (!notes) throw new Error("Carl 備註不可空白");
  if (ready) {
    const selectedAt = section(text, "Carl 勾選日期").value;
    validDate(selectedAt);
    if (
      date > new Date().toISOString().slice(0, 10) ||
      selectedAt > new Date().toISOString().slice(0, 10)
    )
      throw new Error("查證與勾選日期不可在未來");
    if (!/^已勾選\n\S[\s\S]*$/.test(section(text, "Carl 勾選").value))
      throw new Error("缺少 Carl 勾選與對話依據");
    const log = await readLocal(join(dir, "official-log.md"));
    if (
      !log?.trim() ||
      /尚未查證|待完成/.test(log) ||
      !log.includes(date) ||
      !/https?:\/\/\S+/.test(log)
    )
      throw new Error("官方查證紀錄尚未完成");
  }
  return { dir, notes, date };
}

export async function officialRecords(root: string) {
  const base = join(await researchDirectory(root), "official");
  if (!(await directory(base, false, true))) return [];
  const records = [];
  for (const entry of await readdir(base))
    records.push({ id: entry, ...(await readOfficial(root, entry)) });
  return records;
}
