import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { parse, stringify } from "yaml";
import { spotSchema } from "../../src/content/schema.ts";
import { approvedBatch, checkBatch, checkPublicText, digest } from "./batch.ts";
import { readLocal, writeLocal } from "../research/files.ts";

export type Run = (command: "git" | "gh", args: string[]) => string;
export const repository = "CarlLee1983/CarlTravel";
export function runner(root: string): Run {
  return (command, args) =>
    execFileSync(command, args, {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
      timeout: 120_000,
    }).trim();
}
function branchContext(run: Run) {
  const branch = run("git", ["branch", "--show-current"]);
  if (!/^publish\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(branch))
    throw new Error("請使用 publish/<batch> 工作分支，不在 main 發布");
  if (run("git", ["status", "--porcelain"]))
    throw new Error("工作目錄或暫存區不乾淨，先保留並處理既有變更");
  const remote = run("git", ["remote", "get-url", "origin"]);
  if (
    ![
      "https://github.com/CarlLee1983/CarlTravel.git",
      "https://github.com/CarlLee1983/CarlTravel",
      "git@github.com:CarlLee1983/CarlTravel.git",
    ].includes(remote)
  )
    throw new Error("origin 不是指定 CarlTravel 儲存庫");
  if (run("git", ["remote", "get-url", "--push", "--all", "origin"]) !== remote)
    throw new Error("推送目的地與已核對 origin 不一致");
  run("git", ["fetch", "origin", "main"]);
  const base = run("git", ["rev-parse", "origin/main"]);
  if (run("git", ["merge-base", "origin/main", "HEAD"]) !== base)
    throw new Error(
      "工作分支未基於最新 main，請保留工作並從最新 main 建立分支",
    );
  return { branch, base, head: run("git", ["rev-parse", "HEAD"]) };
}

export async function prepare(root: string, batch: string, run = runner(root)) {
  const context = branchContext(run);
  if (context.branch !== `publish/${batch}`)
    throw new Error("批次與工作分支不一致");
  const result = await checkBatch(root, batch);
  if (context.head !== context.base) {
    await auditHistory(root, result, run);
    const pr = existing(run, context.branch);
    if (pr && !pr.isDraft)
      throw new Error("先將既有 PR 轉回 draft，再修改核准內容");
  }
  for (const [id, content] of Object.entries(result.content)) {
    await mkdir(join(root, "content/spots", id), { recursive: true });
    await writeLocal(join(root, "content/spots", id, "spot.yaml"), content);
  }
  return result.ids;
}

async function auditHistory(
  root: string,
  result: Awaited<ReturnType<typeof checkBatch>>,
  run: Run,
) {
  const allowed = result.ids.map((id) => `content/spots/${id}/spot.yaml`);
  const commits = run("git", ["rev-list", "--reverse", "origin/main..HEAD"])
    .split("\n")
    .filter(Boolean);
  if (!commits.length) throw new Error("沒有待發布提交");
  const versions = (await readLocal(join(result.dir, "versions.md")))!;
  for (const commit of commits) {
    const parents = run("git", [
      "rev-list",
      "--parents",
      "-n",
      "1",
      commit,
    ]).split(" ");
    if (parents.length !== 2) throw new Error("發布分支只接受線性內容提交");
    const files = run("git", [
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      commit,
    ])
      .split("\n")
      .filter(Boolean);
    if (!files.length || files.some((file) => !allowed.includes(file)))
      throw new Error("提交歷史含未核准檔案，禁止推送");
    const blobs = files.map(
      (file) => run("git", ["show", `${commit}:${file}`]) + "\n",
    );
    for (const blob of blobs) {
      if (
        !versions
          .split("\n")
          .some((line) => line.startsWith(`- ${digest(blob)} `))
      )
        throw new Error("提交歷史含未經此批次核准與檢查的內容版本，禁止推送");
      const parsed = spotSchema.parse(parse(blob));
      if (stringify(parsed) !== blob)
        throw new Error("歷史內容含非標準 YAML 或私人註解，禁止推送");
    }
    await checkPublicText(root, result.ids, blobs);
    await checkPublicText(
      root,
      result.ids,
      [run("git", ["show", "-s", "--format=%B", commit])],
      true,
    );
  }
}

async function candidate(root: string, batch: string, run: Run) {
  const context = branchContext(run);
  if (context.branch !== `publish/${batch}`)
    throw new Error("批次與工作分支不一致");
  const result = await checkBatch(root, batch);
  await auditHistory(root, result, run);
  for (const id of result.ids) {
    const path = `content/spots/${id}/spot.yaml`;
    if (run("git", ["show", `HEAD:${path}`]) + "\n" !== result.content[id])
      throw new Error(`${id}: 提交內容不是目前核准版本`);
  }
  if (
    run("git", ["rev-parse", "HEAD"]) !== context.head ||
    run("git", ["status", "--porcelain"])
  )
    throw new Error("檢查期間工作分支改變，請重跑");
  if ((await approvedBatch(root, batch)).approvalHash !== result.approvalHash)
    throw new Error("核准紀錄已改變，請重跑");
  return { ...context, ...result };
}
interface PullRequest {
  isCrossRepository: boolean;
  number: number;
  state: string;
  isDraft: boolean;
  headRefOid: string;
  baseRefName: string;
  body: string;
  url: string;
}
function pulls(run: Run, branch: string): PullRequest[] {
  return JSON.parse(
    run("gh", [
      "pr",
      "list",
      "--repo",
      repository,
      "--head",
      branch,
      "--state",
      "all",
      "--json",
      "number,state,isDraft,headRefOid,baseRefName,body,url,isCrossRepository",
    ]),
  );
}
function existing(run: Run, branch: string) {
  const prs = pulls(run, branch);
  if (
    prs.length > 1 ||
    prs.some(
      (pr) =>
        pr.state !== "OPEN" ||
        pr.baseRefName !== "main" ||
        pr.isCrossRepository !== false,
    )
  )
    throw new Error(
      "此分支 PR 已關閉／合入或目標不符，請從最新 main 另開分支與 PR",
    );
  return prs[0];
}
export async function submit(root: string, batch: string, run = runner(root)) {
  const result = await candidate(root, batch, run);
  const pr = existing(run, result.branch);
  if (pr && !pr.isDraft)
    throw new Error("先將既有 PR 轉回 draft，再修改與重跑關卡");
  run("git", [
    "push",
    "--set-upstream",
    "origin",
    `${result.head}:refs/heads/${result.branch}`,
  ]);
  if (pr)
    run("gh", [
      "pr",
      "edit",
      String(pr.number),
      "--repo",
      repository,
      "--body-file",
      join(result.dir, "pr-body.md"),
    ]);
  else
    run("gh", [
      "pr",
      "create",
      "--repo",
      repository,
      "--base",
      "main",
      "--head",
      result.branch,
      "--draft",
      "--title",
      `發布核准景點：${result.ids.join("、")}`,
      "--body-file",
      join(result.dir, "pr-body.md"),
    ]);
  const actual = existing(run, result.branch);
  if (
    !actual?.isDraft ||
    actual.headRefOid !== result.head ||
    actual.body !== result.body
  )
    throw new Error("遠端 draft PR 未符合已驗證提交／公開摘要；保留現況供檢查");
  return actual.url;
}
export async function ready(root: string, batch: string, run = runner(root)) {
  const result = await candidate(root, batch, run);
  const pr = existing(run, result.branch);
  if (!pr?.isDraft || pr.headRefOid !== result.head || pr.body !== result.body)
    throw new Error("PR 必須為相同核准提交與公開摘要的 draft");
  const checks: { name: string; bucket: string; workflow: string }[] =
    JSON.parse(
      run("gh", [
        "pr",
        "checks",
        String(pr.number),
        "--repo",
        repository,
        "--json",
        "name,bucket,workflow",
      ]),
    );
  if (
    !checks.length ||
    !checks.some(
      (check) =>
        check.name === "verify" && check.workflow === "PR verification",
    ) ||
    checks.some((check) => check.bucket !== "pass")
  )
    throw new Error("CI 尚未全綠或缺少完整 verify，保留 draft");
  const latest = existing(run, result.branch);
  if (
    !latest?.isDraft ||
    latest.headRefOid !== result.head ||
    latest.body !== result.body
  )
    throw new Error("PR 在檢查期間改變，保留 draft");
  run("gh", ["pr", "ready", String(pr.number), "--repo", repository]);
  const actual = existing(run, result.branch);
  if (
    !actual ||
    actual.isDraft ||
    actual.headRefOid !== result.head ||
    actual.body !== result.body
  )
    throw new Error("無法確認 ready 結果，請查看遠端狀態");
  return actual.url;
}
