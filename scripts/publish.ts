import { join } from "node:path";
import { snapshot, checkBatch } from "./publish/batch.ts";
import { prepare, submit, ready } from "./publish/remote.ts";
import { researchDirectory, writeLocal } from "./research/files.ts";

async function main() {
  const [command, batch, ...ids] = process.argv.slice(2);
  if (command === "--help") {
    console.log(
      "pnpm publish:content <snapshot|revise> <batch> <id>...\npnpm publish:content <check|prepare|submit|ready> <batch>\nOnly submit/ready write to GitHub. See docs/publishing.md; Carl approval is required.",
    );
    return;
  }
  if (!batch) throw new Error("指定發布批次；用 --help 查詢");
  const root = process.cwd();
  if (command === "snapshot" || command === "revise")
    await snapshot(root, batch, ids, command === "revise");
  else {
    if (ids.length) throw new Error("此命令不接受額外參數");
    if (command === "check") await checkBatch(root, batch);
    else if (command === "prepare") await prepare(root, batch);
    else if (command === "submit") {
      console.log(await submit(root, batch));
      return;
    } else if (command === "ready") {
      console.log(await ready(root, batch));
      return;
    } else throw new Error("未知發布命令；用 --help 查詢");
  }
  console.log(
    "本機操作完成；紀錄與公開摘要候選留在 research/publish/。不代表已發布。",
  );
}
main().catch(async (error: unknown) => {
  const root = await researchDirectory(process.cwd());
  await writeLocal(
    join(root, "publish-error.md"),
    `# 發布阻擋\n\n${error instanceof Error ? error.stack : String(error)}\n`,
  );
  console.error(
    "發布阻擋；詳情見本機 research/publish-error.md。若已推送，保留遠端分支／draft PR，先查看狀態。",
  );
  process.exitCode = 1;
});
