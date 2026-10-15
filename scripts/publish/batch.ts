import { readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { stringify } from "yaml";
import { allSpots, section, readSource } from "../research/records.ts";
import {
  directory,
  readLocal,
  researchDirectory,
  validDate,
  validId,
  writeLocal,
} from "../research/files.ts";
import { checkResearch } from "../research/check.ts";
import { overlap } from "../research/overlap.ts";
import { checkIsolation } from "./isolation.ts";

export const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export async function batchDirectory(
  root: string,
  batch: string,
  create = false,
) {
  validId(batch);
  const base = join(await researchDirectory(root), "publish");
  await directory(base, create);
  const path = join(base, batch);
  await directory(path, create);
  return path;
}

export async function snapshot(
  root: string,
  batch: string,
  ids: string[],
  renew = false,
) {
  if (!ids.length || new Set(ids).size !== ids.length)
    throw new Error("指定不重複的草稿 id");
  ids.forEach(validId);
  const { drafts } = await allSpots(root);
  const entries = [];
  const bases = [];
  for (const id of ids) {
    if (!drafts.some((spot) => spot.id === id))
      throw new Error(`${id}: 找不到草稿`);
    const raw = await readLocal(join(root, "drafts/spots", id, "spot.yaml"));
    entries.push(`- ${id} ${digest(raw!)}`);
    const formal = await readLocal(
      join(root, "content/spots", id, "spot.yaml"),
      true,
    );
    bases.push(`- ${id} ${formal === undefined ? "absent" : digest(formal)}`);
  }
  const dir = await batchDirectory(root, batch, true);
  if (renew) {
    const previous = (await readLocal(join(dir, "approval.md")))!;
    const previousIds = section(previous, "指定草稿與 SHA256")
      .value.split("\n")
      .map((line) => line.split(" ")[1])
      .sort();
    if (JSON.stringify(previousIds) !== JSON.stringify([...ids].sort()))
      throw new Error("同批次須維持指定景點，範圍改變請另開批次與 PR");
    const archive = join(dir, `approval-${digest(previous)}.md`);
    if ((await readLocal(archive, true)) === undefined)
      await writeLocal(archive, previous, true);
  }
  await writeLocal(
    join(dir, "approval.md"),
    `# 發布批次 ${batch}\n\n## 指定草稿與 SHA256\n${entries.join("\n")}\n\n## 正式基準與 SHA256\n${bases.join("\n")}\n\n## Carl 核准日期\n未核准\n\n## Carl 決定\n未核准\n`,
    !renew,
  );
}

export async function approvedBatch(root: string, batch: string) {
  const dir = await batchDirectory(root, batch);
  const text = (await readLocal(join(dir, "approval.md")))!;
  const headings = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  if (
    headings.join("|") !==
    "指定草稿與 SHA256|正式基準與 SHA256|Carl 核准日期|Carl 決定"
  )
    throw new Error("核准紀錄標題不完整或重複");
  const date = section(text, "Carl 核准日期").value;
  if (date === "未核准") throw new Error("尚未取得 Carl 核准");
  validDate(date);
  if (date > new Date().toISOString().slice(0, 10))
    throw new Error("核准日期不可在未來");
  const decision = section(text, "Carl 決定").value;
  if (!/^核准\n\S[\s\S]*$/.test(decision))
    throw new Error("缺少 Carl 核准決定與對話依據");
  const lines = section(text, "指定草稿與 SHA256").value.split("\n");
  const ids: string[] = [];
  for (const line of lines) {
    const match = /^- ([a-z0-9]+(?:-[a-z0-9]+)*) ([a-f0-9]{64})$/.exec(line);
    if (!match) throw new Error("核准草稿清單格式不完整");
    const id = match[1]!;
    if (ids.includes(id)) throw new Error("核准草稿重複");
    const raw = await readLocal(join(root, "drafts/spots", id, "spot.yaml"));
    if (digest(raw!) !== match[2])
      throw new Error(`${id}: 草稿已不同於核准版本，請重新審閱`);
    ids.push(id);
  }
  const bases: Record<string, string> = {};
  for (const line of section(text, "正式基準與 SHA256").value.split("\n")) {
    const match = /^- ([a-z0-9]+(?:-[a-z0-9]+)*) (absent|[a-f0-9]{64})$/.exec(
      line,
    );
    if (!match || bases[match[1]!] || !ids.includes(match[1]!))
      throw new Error("正式基準紀錄不完整");
    bases[match[1]!] = match[2]!;
  }
  if (Object.keys(bases).length !== ids.length)
    throw new Error("正式基準紀錄不完整");
  return { dir, ids, bases, approvalHash: digest(text) };
}

// Raw candidate blobs and PR text must never carry private notes or an entire original.
// Quoted excerpts are already checked at the typed research boundary.
export async function checkPublicText(
  root: string,
  ids: string[],
  texts: string[],
  originalOverlap = false,
) {
  const { formal, drafts } = await allSpots(root);
  const sourceIds = new Set(
    [...formal, ...drafts].flatMap((spot) =>
      spot.sources.map((source) => source.id),
    ),
  );
  for (const entry of await readdir(join(root, "research"), {
    withFileTypes: true,
  })) {
    if (
      entry.isDirectory() &&
      entry.name !== "publish" &&
      (await readLocal(
        join(root, "research", entry.name, "source.md"),
        true,
      )) !== undefined
    )
      sourceIds.add(entry.name);
  }
  for (const sourceId of sourceIds) {
    const record = await readSource(root, sourceId);
    const notes = section(record.text, "Carl 備註").value;
    const original = await readLocal(join(record.dir, "original.txt"), true);
    for (const text of texts) {
      if (
        notes !== "無" &&
        (overlap(notes, text) || (notes.trim() && text.includes(notes.trim())))
      )
        throw new Error(`${sourceId}: 公開內容含私人備註`);
      if (
        original?.trim() &&
        (text.includes(original.trim()) ||
          (originalOverlap && overlap(original, text)))
      )
        throw new Error(`${sourceId}: 公開內容含原文全文`);
    }
  }
  // `ids` documents the batch whose public material is being inspected, not permission
  // to skip other local sources' private notes.
  if (!ids.length) throw new Error("缺少發布景點");
}

export async function checkBatch(root: string, batch: string) {
  const approved = await approvedBatch(root, batch);
  const research = await checkResearch(root, approved.ids);
  if (!research.ok)
    throw new Error(
      "本機重疊／來源／schema 關卡失敗；見 research/overlap-report.md",
    );
  const { drafts } = await allSpots(root);
  const content: Record<string, string> = {};
  for (const id of approved.ids) {
    const { id: _id, ...data } = drafts.find((spot) => spot.id === id)!;
    content[id] = stringify(data);
    const formal = await readLocal(
      join(root, "content/spots", id, "spot.yaml"),
      true,
    );
    const hash = formal === undefined ? "absent" : digest(formal);
    if (hash !== approved.bases[id] && hash !== digest(content[id]))
      throw new Error(`${id}: 正式內容已不同於審閱基準，先檢查差異並重新審閱`);
  }
  const body = `## Summary\n\n核准景點：${approved.ids.map((id) => `\`${id}\``).join("、")}\n\n\`\`\`text\nCarl 審閱 → 本機關卡 → draft PR → CI → Carl 合入\n\`\`\`\n\n## Evidence\n\n- **Before:** 指定內容只存在本機草稿。\n  **After:** 本機核准版本、schema、來源、重疊與正式輸出隔離檢查通過。\n${research.sources.map((source) => `- ${source.id}: original=${source.original}${source.original === "not_run_approved_unreadable" ? "（未執行：原文無法讀取）" : ""}; notes=${source.notes}`).join("\n")}\n\n## Merge Danger\n\n**Door:** two-way\n\n回復需另開 PR，由 Carl 合入。\n\n**Blast Radius:** content\n\n合入後仍須部署成功與公開頁驗證，才算完成上線。\n`;
  await checkPublicText(root, approved.ids, [...Object.values(content), body]);
  try {
    execFileSync(process.execPath, ["scripts/site.mjs", "build"], {
      cwd: root,
      stdio: "pipe",
      timeout: 120_000,
    });
  } catch (error) {
    await writeLocal(join(approved.dir, "build-error.txt"), String(error));
    throw new Error("正式建置失敗；詳情只留本機 build-error.txt");
  }
  const isolated = await checkIsolation(root);
  await checkPublicText(root, approved.ids, isolated.texts);
  const after = await approvedBatch(root, batch);
  if (after.approvalHash !== approved.approvalHash)
    throw new Error("檢查期間核准紀錄改變，請重跑");
  const versionsFile = join(approved.dir, "versions.md");
  let versions =
    (await readLocal(versionsFile, true)) ?? "# 已通過關卡的核准公開版本\n\n";
  for (const value of Object.values(content)) {
    const line = `- ${digest(value)} ${approved.approvalHash}`;
    if (!versions.split("\n").includes(line)) versions += line + "\n";
  }
  await writeLocal(versionsFile, versions);
  await writeLocal(join(approved.dir, "pr-body.md"), body);
  return { ...approved, content, body, sources: research.sources };
}
