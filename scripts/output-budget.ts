// 建置輸出的規模預算與檢查。check-output.ts 與 check:scale 共用，不各寫一份。
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { brotliCompressSync } from "node:zlib";
import { decodeList, type ListEntry } from "../src/content/list.ts";

export const budget = {
  // Workers 免費方案上限 20,000 檔，保留 10% 緩衝
  maxFiles: 18_000,
  listBrotliBytes: 400 * 1024,
  listRawBytes: 1.5 * 1024 * 1024,
};
export type Budget = typeof budget;

const listDirectory = "spot-list";

export async function countFiles(output: string) {
  const entries = await readdir(output, {
    recursive: true,
    withFileTypes: true,
  });
  return entries.filter((entry) => !entry.isDirectory()).length;
}

export async function checkFileCount(output: string, maxFiles: number) {
  const count = await countFiles(output);
  if (count > maxFiles)
    throw new Error(`輸出檔案總數 ${count} 超過上限 ${maxFiles}`);
  return count;
}

// 建置只輸出一個列表 JSON；找不到或有多個都是錯誤
export async function findListJson(output: string) {
  const names = (
    await readdir(join(output, listDirectory)).catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return [];
      throw error;
    })
  ).filter((name) => name.endsWith(".json"));
  if (names.length !== 1)
    throw new Error(`列表 JSON 必須剛好一個，實際 ${names.length} 個`);
  return join(output, listDirectory, names[0]!);
}

export async function checkListSize(
  file: string,
  limits: Pick<Budget, "listBrotliBytes" | "listRawBytes">,
) {
  const raw = await readFile(file);
  const brotli = brotliCompressSync(raw).length;
  if (raw.length > limits.listRawBytes)
    throw new Error(
      `列表 JSON 原始大小 ${raw.length} B 超過上限 ${limits.listRawBytes} B`,
    );
  if (brotli > limits.listBrotliBytes)
    throw new Error(
      `列表 JSON brotli 後 ${brotli} B 超過上限 ${limits.listBrotliBytes} B`,
    );
  return { raw: raw.length, brotli };
}

// 筆數必須等於正式景點數；資料邊界：不得含 fixture 名稱、草稿或 fixture id
export async function readListEntries(
  file: string,
  expectedIds: readonly string[],
  forbidden: readonly string[] = [],
): Promise<ListEntry[]> {
  const text = await readFile(file, "utf8");
  const entries = decodeList(JSON.parse(text));
  if (entries.length !== expectedIds.length)
    throw new Error(
      `列表 JSON 筆數 ${entries.length} 不等於正式景點數 ${expectedIds.length}`,
    );
  const leaked = forbidden.find((term) => text.includes(term));
  if (leaked !== undefined)
    throw new Error("列表 JSON 含 fixture 名稱或草稿 id");
  const ids = entries.map((entry) => entry.id).sort();
  if (JSON.stringify(ids) !== JSON.stringify([...expectedIds].sort()))
    throw new Error("列表 JSON 的 id 與正式景點不符，疑似含 fixture 或草稿 id");
  return entries;
}
