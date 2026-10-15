import { join } from "node:path";
import {
  initResearch,
  methods,
  captureOriginal,
  recordAttempt,
  acceptUnreadable,
  type Method,
} from "./research/records.ts";
import { checkResearch } from "./research/check.ts";
import { matchIdentity } from "./research/identity.ts";
import { readLocal, researchDirectory, writeLocal } from "./research/files.ts";

const usage = `Usage: pnpm research <command>
  init <YYYY-MM-DD> <slug> <source-url>
  attempt <source-id> <defuddle|WebFetch|browser> <failed|unavailable> <evidence-file>
  capture <source-id> <defuddle|WebFetch|browser|carl> <original-file>
  accept-unreadable <source-id> <YYYY-MM-DD> <Carl-decision-file>
  match <name> <address> [tourism-id]
  check <draft-id> [draft-id ...]`;
function method(value: string | undefined): Method {
  if (!methods.includes(value as Method))
    throw new Error("Invalid reading method");
  return value as Method;
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  const root = process.cwd();
  if (command === "--help" || !command) {
    console.log(usage);
    return;
  }
  if (command === "init" && args.length === 3)
    console.log(
      JSON.stringify({
        sourceId: await initResearch(root, args[0]!, args[1]!, args[2]!),
      }),
    );
  else if (
    command === "attempt" &&
    args.length === 4 &&
    ["failed", "unavailable"].includes(args[2]!)
  ) {
    await recordAttempt(
      root,
      args[0]!,
      method(args[1]),
      args[2] === "failed" ? "失敗" : "工具不可用",
      (await readLocal(args[3]!))!,
    );
    console.log("讀取嘗試已留在本機。");
  } else if (command === "capture" && args.length === 3) {
    await captureOriginal(
      root,
      args[0]!,
      args[1] === "carl" ? "carl" : method(args[1]),
      args[2]!,
    );
    console.log("原文與取得紀錄已留在本機。");
  } else if (command === "accept-unreadable" && args.length === 3) {
    await acceptUnreadable(
      root,
      args[0]!,
      args[1]!,
      (await readLocal(args[2]!))!,
    );
    console.log("Carl 的既有決定已記錄；這個指令不代為核准。");
  } else if (command === "match" && [2, 3].includes(args.length))
    console.log(
      JSON.stringify(
        await matchIdentity(root, args[0]!, args[1]!, args[2]),
        null,
        2,
      ),
    );
  else if (command === "check" && args.length) {
    const result = await checkResearch(root, args);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } else throw new Error(usage);
}
main().catch(async (error) => {
  try {
    const root = await researchDirectory(process.cwd());
    await writeLocal(
      join(root, "tool-error.md"),
      `# 本機工具錯誤\n\n${new Date().toISOString()}\n\n${error instanceof Error ? error.message : String(error)}\n`,
    );
    console.error(
      "本機研究工具失敗；詳細診斷留在 research/tool-error.md。執行 pnpm research --help 查看用法。",
    );
  } catch {
    console.error(
      "本機研究工具失敗，無法安全寫入研究目錄。請檢查本機路徑與權限。",
    );
  }
  process.exitCode = 1;
});
