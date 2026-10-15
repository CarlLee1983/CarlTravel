import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { loadSpots } from "../../src/content/load.ts";
import {
  directory,
  researchDirectory,
  readLocal,
  writeLocal,
  validDate,
  validId,
} from "./files.ts";

export const methods = ["defuddle", "WebFetch", "browser"] as const;
export type Method = (typeof methods)[number];
const headings = [
  "來源 id",
  "網址",
  "讀取日期",
  "讀取嘗試",
  "Carl 備註",
  "Carl 接受不可讀",
  "讀取歷程",
];
export const reviewHeadings = [
  "景點清單與修訂差異",
  "衝突",
  "官方未公布",
  "推估與疑點",
  "不可讀官方頁",
  "可疑內容",
  "重疊檢查結果",
  "預覽網址",
];

export function section(text: string, heading: string, level = 2) {
  const matches = [
    ...text.matchAll(new RegExp(`^${"#".repeat(level)} (.+)$`, "gm")),
  ];
  const found = matches.filter((match) => match[1] === heading);
  if (found.length !== 1) throw new Error(`研究紀錄缺少或重複標題：${heading}`);
  const match = found[0]!;
  const next = matches[matches.indexOf(match) + 1];
  const start = match.index! + match[0].length + 1;
  return {
    value: text.slice(start, next?.index).trim(),
    start,
    end: next?.index ?? text.length,
  };
}
function replaceSection(
  text: string,
  heading: string,
  value: string,
  level = 2,
) {
  const { start, end } = section(text, heading, level);
  return text.slice(0, start) + value.trim() + "\n\n" + text.slice(end);
}
function indent(text: string) {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => `    ${line}`)
    .join("\n");
}
export async function readSource(root: string, id: string) {
  const dir = await researchDirectory(root, id);
  const text = (await readLocal(join(dir, "source.md")))!.replace(
    /\r\n/g,
    "\n",
  );
  const names = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  if (names.join("|") !== headings.join("|"))
    throw new Error("source.md 固定標題不完整");
  for (const name of headings) section(text, name);
  if (section(text, "來源 id").value !== id)
    throw new Error("研究來源 id 不一致");
  validDate(section(text, "讀取日期").value);
  return { dir, text };
}
export async function allSpots(root: string) {
  const formal = await loadSpots(join(root, "content/spots"));
  let drafts = [] as typeof formal;
  if (await directory(join(root, "drafts"), false, true)) {
    if (await directory(join(root, "drafts/spots"), false, true))
      drafts = await loadSpots(join(root, "drafts/spots"));
  }
  return { formal, drafts };
}
export async function initResearch(
  root: string,
  date: string,
  slug: string,
  url: string,
) {
  validDate(date);
  validId(slug);
  if (
    /[\r\n]/.test(url) ||
    !["http:", "https:"].includes(new URL(url).protocol)
  )
    throw new Error("來源網址必須是 HTTP(S)");
  const { formal, drafts } = await allSpots(root);
  const reserved = new Set(
    [...formal, ...drafts].flatMap((spot) =>
      spot.sources.map((source) => source.id),
    ),
  );
  const base = await researchDirectory(root);
  const prefix = `${date.replaceAll("-", "")}-${slug}`;
  for (let n = 1; ; n++) {
    const id = prefix + (n === 1 ? "" : `-${n}`);
    if (reserved.has(id)) continue;
    const dir = join(base, id);
    try {
      await mkdir(dir, { mode: 0o700 });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST")
        continue;
      throw error;
    }
    const values = [
      id,
      url,
      date,
      methods.map((method) => `### ${method}\n未執行`).join("\n\n"),
      "無",
      "未核准",
      "尚未取得原文。",
    ];
    await writeLocal(
      join(dir, "source.md"),
      "# 來源研究\n\n" +
        headings
          .map((heading, i) => `## ${heading}\n${values[i]}\n`)
          .join("\n"),
      true,
    );
    await writeLocal(
      join(dir, "spots.md"),
      "# 拆分與勾選\n\n" +
        [
          "新建或明確補充",
          "周邊安排",
          "略過",
          "同一性待確認",
          "Carl 勾選與日期",
          "本批與待續",
        ]
          .map((heading) => `## ${heading}\n待確認\n`)
          .join("\n"),
      true,
    );
    await writeLocal(
      join(dir, "official-log.md"),
      "# 官方查證\n\n依分節記錄事實、三層官方網址、讀取工具、結果、日期與尚待處理事項。尚未查證。\n",
      true,
    );
    await writeLocal(
      join(dir, "review.md"),
      "# 送審清單\n\n" +
        reviewHeadings.map((heading) => `## ${heading}\n待完成\n`).join("\n"),
      true,
    );
    return id;
  }
}
function checkOrder(text: string, method: Method) {
  const attempts = section(text, "讀取嘗試").value;
  for (const previous of methods.slice(0, methods.indexOf(method)))
    if (!/^(失敗|工具不可用)\n/.test(section(attempts, previous, 3).value))
      throw new Error(`先記錄 ${previous} 的讀取結果`);
}
export async function captureOriginal(
  root: string,
  id: string,
  method: Method | "carl",
  input: string,
) {
  const record = await readSource(root, id);
  if (method !== "carl") checkOrder(record.text, method);
  const original = await readLocal(input);
  if (!original?.trim()) throw new Error("原文不得為空");
  if ((await readLocal(join(record.dir, "original.txt"), true)) !== undefined)
    throw new Error("original.txt 已存在，不覆寫");
  const date = new Date().toISOString().slice(0, 10);
  const { hash } = verifyOriginal(record.text, original);
  let text = record.text;
  if (method !== "carl" && !approvedUnreadable(record.text)) {
    const attempts = replaceSection(
      section(text, "讀取嘗試").value,
      method,
      "成功\n原文已保存。",
      3,
    );
    text = replaceSection(text, "讀取嘗試", attempts);
  }
  // Persist acquisition before writing the original: interruption must fail closed.
  text += `\n- 原文已保存：${date}；方式：${method}；SHA256：${hash}\n`;
  await writeLocal(join(record.dir, "source.md"), text);
  await writeLocal(join(record.dir, "original.txt"), original, true);
}

export function everObtained(text: string) {
  return (
    section(text, "讀取歷程").value.includes("原文已保存：") ||
    methods.some((method) =>
      section(section(text, "讀取嘗試").value, method, 3).value.startsWith(
        "成功\n",
      ),
    )
  );
}
export function approvedUnreadable(text: string) {
  const attempts = section(text, "讀取嘗試").value;
  if (
    !methods.every((method) =>
      /^(失敗|工具不可用)\n\s+\S/.test(section(attempts, method, 3).value),
    )
  )
    return false;
  const approval = section(text, "Carl 接受不可讀").value;
  const match = /^日期：(\d{4}-\d{2}-\d{2})\n決定：\n\s+\S/.exec(approval);
  if (!match) return false;
  validDate(match[1]!);
  return match[1]! >= section(text, "讀取日期").value;
}
export async function recordAttempt(
  root: string,
  id: string,
  method: Method,
  result: "失敗" | "工具不可用",
  evidence: string,
) {
  if (!evidence.trim()) throw new Error("讀取嘗試必須記錄結果與原因");
  const record = await readSource(root, id);
  checkOrder(record.text, method);
  const attempts = replaceSection(
    section(record.text, "讀取嘗試").value,
    method,
    `${result}\n${indent(evidence)}`,
    3,
  );
  const text =
    replaceSection(record.text, "讀取嘗試", attempts) +
    `\n- 讀取嘗試：${new Date().toISOString()}；${method}；${result}\n${indent(evidence)}\n`;
  await writeLocal(join(record.dir, "source.md"), text);
}
export async function acceptUnreadable(
  root: string,
  id: string,
  date: string,
  decision: string,
) {
  validDate(date);
  if (!decision.trim()) throw new Error("必須保存 Carl 的對話決定摘要");
  const record = await readSource(root, id);
  if (
    everObtained(record.text) ||
    (await readLocal(join(record.dir, "original.txt"), true)) !== undefined
  )
    throw new Error("原文曾取得；不得改標不可讀來略過檢查");
  if (section(record.text, "Carl 接受不可讀").value !== "未核准")
    throw new Error("Carl 決定已記錄，不覆寫");
  const text = replaceSection(
    record.text,
    "Carl 接受不可讀",
    `日期：${date}\n決定：\n${indent(decision)}`,
  );
  if (!approvedUnreadable(text))
    throw new Error("讀取嘗試或核准日期尚未符合不可讀例外");
  await writeLocal(join(record.dir, "source.md"), text);
}

function verifyOriginal(text: string, original: string) {
  const hash = createHash("sha256").update(original).digest("hex");
  const hashes = new Set(
    [
      ...section(text, "讀取歷程").value.matchAll(/SHA256：([a-f0-9]{64})/g),
    ].map((match) => match[1]),
  );
  const receipts = section(text, "讀取歷程")
    .value.split("\n")
    .filter((line) => line.includes("原文已保存："));
  if (
    (everObtained(text) && hashes.size !== 1) ||
    receipts.some((line) => !/SHA256：[a-f0-9]{64}$/.test(line)) ||
    hashes.size > 1 ||
    (hashes.size === 1 && !hashes.has(hash))
  )
    throw new Error("原文與保存紀錄不一致，請恢復已保存原文");
  return { hash, hasReceipt: hashes.size > 0 };
}

// Gate observations also retain acquisition evidence if an original was restored by hand.
export async function observeOriginal(
  dir: string,
  text: string,
  original: string,
) {
  const { hash, hasReceipt } = verifyOriginal(text, original);
  if (!hasReceipt)
    await writeLocal(
      join(dir, "source.md"),
      text +
        `\n- 原文已保存：${new Date().toISOString().slice(0, 10)}；方式：本機關卡發現原文；SHA256：${hash}\n`,
    );
}
