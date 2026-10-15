import { join } from "node:path";
import { checkIsolation } from "./publish/isolation.ts";
import { researchDirectory, writeLocal } from "./research/files.ts";
try {
  const result = await checkIsolation(process.cwd());
  console.log(`Formal Pagefind verified: ${result.urls.length} spot(s).`);
} catch (error) {
  const dir = await researchDirectory(process.cwd());
  await writeLocal(
    join(dir, "index-error.md"),
    `# 索引驗證阻擋\n\n${error instanceof Error ? error.stack : String(error)}\n`,
  );
  console.error("正式索引／隔離驗證失敗；詳情見本機 research/index-error.md。");
  process.exitCode = 1;
}
