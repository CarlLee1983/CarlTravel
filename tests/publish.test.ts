import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { workspace } from "./helpers/workspace.ts";
import { initResearch, captureOriginal } from "../scripts/research/records.ts";
import { snapshot, checkBatch } from "../scripts/publish/batch.ts";

async function scenario() {
  const workspaceResult = await workspace();
  const { root } = workspaceResult;
  const source = await initResearch(
    root,
    "2026-10-15",
    "publish",
    "https://example.org/publish",
  );
  await writeFile(
    join(root, "input.txt"),
    "只有本機保留的完整虛構文章，包含獨特原文段落供比對。",
  );
  await captureOriginal(root, source, "carl", join(root, "input.txt"));
  const data = parse(
    await readFile(join(root, "content/spots/approved-park/spot.yaml"), "utf8"),
  );
  data.name = "已發布測試公園";
  await writeFile(
    join(root, "content/spots/approved-park/spot.yaml"),
    stringify(data),
  );
  data.sources = [
    {
      id: source,
      title: "虛構來源",
      author: "測試作者",
      url: "https://example.org/publish",
      readAt: "2026-10-15",
      readable: true,
    },
  ];
  data.authorNotes = [{ source, summary: "樹蔭步道是來源提及的觀察重點。" }];
  data.name = "核准修訂公園";
  await mkdir(join(root, "drafts/spots/approved-park"), { recursive: true });
  const draft = join(root, "drafts/spots/approved-park/spot.yaml");
  await writeFile(
    draft,
    stringify(data) + "# synthetic private comment must stay local\n",
  );
  await snapshot(root, "batch-one", ["approved-park"]);
  const approval = join(root, "research/publish/batch-one/approval.md");
  const approve = async () => {
    const text = await readFile(approval, "utf8");
    await writeFile(
      approval,
      text
        .replace("## Carl 核准日期\n未核准", "## Carl 核准日期\n2026-10-15")
        .replace(
          "## Carl 決定\n未核准",
          "## Carl 決定\n核准\n虛構測試決策：核准此批指定內容；不是實際 Carl 決定。",
        ),
    );
  };
  return { ...workspaceResult, draft, approval, approve, source };
}

test(
  "publish blocks absent approval and changed drafts; approved batch exports only canonical public content",
  { timeout: 120_000 },
  async () => {
    const { root, cleanup, draft, approve } = await scenario();
    try {
      await assert.rejects(checkBatch(root, "batch-one"), /核准/);
      await approve();
      const before = await readFile(draft, "utf8");
      await writeFile(draft, before + "# changed after approval\n");
      await assert.rejects(checkBatch(root, "batch-one"), /核准版本/);
      await writeFile(draft, before);
      const result = await checkBatch(root, "batch-one");
      assert.deepEqual(result.ids, ["approved-park"]);
      assert.match(result.body, /## Summary/);
      assert.match(result.body, /20261015-publish.*pass/);
      assert.doesNotMatch(
        result.body,
        /虛構測試決策|完整虛構文章|private comment/,
      );
      assert.doesNotMatch(result.content["approved-park"]!, /private comment/);
      assert.match(
        await readFile(
          join(root, "content/spots/approved-park/spot.yaml"),
          "utf8",
        ),
        /已發布測試公園/,
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  "publish submission and ready keep GitHub behind local gates and matching green CI",
  { timeout: 180_000 },
  async () => {
    const { root, cleanup, approve, draft, source } = await scenario();
    const { execFileSync } = await import("node:child_process");
    const { prepare, submit, ready } =
      await import("../scripts/publish/remote.ts");
    const git = (args: string[]) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: "pipe",
      }).trim();
    git(["init", "-b", "main"]);
    git(["config", "user.email", "fixture@example.invalid"]);
    git(["config", "user.name", "Synthetic test"]);
    git(["add", "."]);
    git(["commit", "-m", "fixture baseline"]);
    git(["update-ref", "refs/remotes/origin/main", "HEAD"]);
    git(["switch", "-c", "publish/batch-one"]);
    const writes: string[] = [];
    let failCreate = true;
    let tamperReady = false;
    let raceHead: string | undefined;
    let raceInjected = false;
    let pr:
      | {
          isCrossRepository: boolean;
          number: number;
          state: string;
          isDraft: boolean;
          headRefOid: string;
          baseRefName: string;
          body: string;
          url: string;
        }
      | undefined;
    let checks = [
      { name: "verify", workflow: "PR verification", bucket: "pending" },
    ];
    const run = (command: "git" | "gh", args: string[]) => {
      if (command === "git") {
        if (args[0] === "remote")
          return "https://github.com/CarlLee1983/CarlTravel.git";
        if (args[0] === "fetch") return "";
        if (args[0] === "push") {
          assert.match(
            args.at(-1)!,
            /^[a-f0-9]{40}:refs\/heads\/publish\/batch-one$/,
          );
          if (raceHead) {
            assert.equal(
              args.at(-1),
              `${raceHead}:refs/heads/publish/batch-one`,
            );
            git(["update-ref", "refs/heads/publish/batch-one", raceHead]);
            raceHead = undefined;
          }
          writes.push("push");
          return "";
        }
        return git(args);
      }
      if (args[1] === "list") {
        if (!raceInjected) {
          raceInjected = true;
          raceHead = git(["rev-parse", "HEAD"]);
          git(["update-ref", "refs/heads/publish/batch-one", "origin/main"]);
        }
        return JSON.stringify(pr ? [pr] : []);
      }
      if (args[1] === "checks") return JSON.stringify(checks);
      if (args[1] === "create") {
        if (failCreate)
          throw new Error("synthetic GitHub create failure after push");
        writes.push("create draft");
        pr = {
          isCrossRepository: false,
          number: 1,
          state: "OPEN",
          isDraft: args.includes("--draft"),
          headRefOid: git(["rev-parse", "HEAD"]),
          baseRefName: "main",
          body: execFileSync("cat", [args[args.indexOf("--body-file") + 1]!], {
            encoding: "utf8",
          }),
          url: "https://example.invalid/pull/1",
        };
        return pr.url;
      }
      if (args[1] === "edit") {
        writes.push("edit draft");
        pr!.headRefOid = git(["rev-parse", "HEAD"]);
        pr!.body = execFileSync(
          "cat",
          [args[args.indexOf("--body-file") + 1]!],
          { encoding: "utf8" },
        );
        return "";
      }
      if (args[1] === "ready") {
        writes.push("ready");
        pr!.isDraft = false;
        if (tamperReady) pr!.body += "unreviewed change";
        return "";
      }
      throw new Error(
        `Unexpected mocked command: ${command} ${args.join(" ")}`,
      );
    };
    try {
      await assert.rejects(prepare(root, "batch-one", run), /核准/);
      assert.deepEqual(writes, []);
      await approve();
      await prepare(root, "batch-one", run);
      git(["add", "content/spots/approved-park/spot.yaml"]);
      git(["commit", "-m", "publish approved fixture"]);
      const raw = await readFile(draft, "utf8");
      await writeFile(draft, raw + "# post review edit\n");
      await assert.rejects(submit(root, "batch-one", run), /核准版本/);
      assert.deepEqual(writes, []);
      await writeFile(draft, raw);
      await assert.rejects(
        submit(root, "batch-one", run),
        /GitHub create failure/,
      );
      assert.deepEqual(writes, ["push"]);
      failCreate = false;
      assert.equal(
        await submit(root, "batch-one", run),
        "https://example.invalid/pull/1",
      );
      assert.deepEqual(writes, ["push", "push", "create draft"]);
      await assert.rejects(ready(root, "batch-one", run), /CI/);
      assert.equal(pr!.isDraft, true);
      checks = [
        { name: "verify", workflow: "PR verification", bucket: "pass" },
      ];
      const head = pr!.headRefOid;
      pr!.headRefOid = "changed-remote-head";
      await assert.rejects(ready(root, "batch-one", run), /相同核准提交/);
      pr!.headRefOid = head;
      const verifiedBody = pr!.body;
      tamperReady = true;
      await assert.rejects(ready(root, "batch-one", run), /無法確認 ready/);
      pr!.body = verifiedBody;
      pr!.isDraft = true;
      tamperReady = false;
      assert.equal(
        await ready(root, "batch-one", run),
        "https://example.invalid/pull/1",
      );
      assert.deepEqual(writes, [
        "push",
        "push",
        "create draft",
        "ready",
        "ready",
      ]);
      pr!.isDraft = true;
      await writeFile(draft, raw.replace("核准修訂公園", "再次核准修訂公園"));
      await snapshot(root, "batch-one", ["approved-park"], true);
      await approve();
      await prepare(root, "batch-one", run);
      git(["add", "content/spots/approved-park/spot.yaml"]);
      git(["commit", "-m", "content: approved revision"]);
      await submit(root, "batch-one", run);
      assert.deepEqual(writes, [
        "push",
        "push",
        "create draft",
        "ready",
        "ready",
        "push",
        "edit draft",
      ]);
      pr!.state = "MERGED";
      await assert.rejects(submit(root, "batch-one", run), /已關閉／合入/);
      assert.deepEqual(writes, [
        "push",
        "push",
        "create draft",
        "ready",
        "ready",
        "push",
        "edit draft",
      ]);
      pr!.state = "OPEN";
      pr!.isDraft = true;
      await writeFile(
        join(root, "accidental-private.txt"),
        "synthetic private artifact",
      );
      git(["add", "accidental-private.txt"]);
      git(["commit", "-m", "accidental artifact"]);
      git(["rm", "accidental-private.txt"]);
      git(["commit", "-m", "remove artifact"]);
      await assert.rejects(
        submit(root, "batch-one", run),
        /提交歷史含未核准檔案/,
      );
      assert.deepEqual(writes, [
        "push",
        "push",
        "create draft",
        "ready",
        "ready",
        "push",
        "edit draft",
      ]);
      const sourceFile = join(root, "research", source, "source.md");
      await writeFile(
        sourceFile,
        (await readFile(sourceFile, "utf8")).replace(
          "## Carl 備註\n無",
          "## Carl 備註\n樹蔭步道是來源提及的觀察重點。",
        ),
      );
      await assert.rejects(submit(root, "batch-one", run), /重疊/);
      assert.deepEqual(writes, [
        "push",
        "push",
        "create draft",
        "ready",
        "ready",
        "push",
        "edit draft",
      ]);
    } finally {
      await cleanup();
    }
  },
);

test(
  "publish blocks overlap, private quotes, images and lost originals even with a renewed approval",
  { timeout: 120_000 },
  async () => {
    const { root, cleanup, draft, source, approve } = await scenario();
    const { rm } = await import("node:fs/promises");
    try {
      const originalDraft = parse(await readFile(draft, "utf8"));
      const sourceFile = join(root, "research", source, "source.md");
      const savedSource = await readFile(sourceFile, "utf8");
      const privateNote = "這是絕對不能公開的私人家庭備註文字";
      for (const mode of [
        "original",
        "private-quote",
        "image",
        "lost-original",
        "relabel",
      ] as const) {
        const data = structuredClone(originalDraft);
        await writeFile(sourceFile, savedSource);
        if (mode === "original")
          data.authorNotes[0].summary =
            "只有本機保留的完整虛構文章，包含獨特原文段落供比對。";
        if (mode === "private-quote") {
          data.authorNotes[0].quotes = [privateNote];
          await writeFile(
            sourceFile,
            savedSource.replace(
              "## Carl 備註\n無",
              `## Carl 備註\n${privateNote}`,
            ),
          );
        }
        if (mode === "relabel") {
          data.sources[0].readable = false;
          data.authorNotes = [];
        }
        await writeFile(draft, stringify(data));
        await snapshot(root, "batch-one", ["approved-park"], true);
        await approve();
        if (mode === "image")
          await writeFile(
            join(root, "drafts/spots/approved-park/photo.png"),
            "synthetic image",
          );
        if (mode === "lost-original")
          await rm(join(root, "research", source, "original.txt"));
        await assert.rejects(
          checkBatch(root, "batch-one"),
          /重疊／來源／schema/,
        );
        if (mode === "image")
          await rm(join(root, "drafts/spots/approved-park/photo.png"));
      }
    } finally {
      await cleanup();
    }
  },
);

test(
  "publish preserves per-source unreadable status and blocks missing exception evidence",
  { timeout: 120_000 },
  async () => {
    const { root, cleanup, draft, approve } = await scenario();
    const { recordAttempt, acceptUnreadable } =
      await import("../scripts/research/records.ts");
    try {
      const source = await initResearch(
        root,
        "2026-10-15",
        "unreadable",
        "https://example.org/unreadable",
      );
      const data = parse(await readFile(draft, "utf8"));
      data.sources.push({
        id: source,
        title: "另一份虛構來源",
        author: "測試網站",
        url: "https://example.org/unreadable",
        readAt: "2026-10-15",
        readable: false,
      });
      await writeFile(draft, stringify(data));
      await snapshot(root, "batch-one", ["approved-park"], true);
      await approve();
      await assert.rejects(checkBatch(root, "batch-one"), /來源/);
      for (const method of ["defuddle", "WebFetch", "browser"] as const)
        await recordAttempt(
          root,
          source,
          method,
          "失敗",
          "虛構測試：工具無法讀取。",
        );
      await acceptUnreadable(
        root,
        source,
        "2026-10-15",
        "虛構測試：Carl 接受此來源不可讀，非真人決定。",
      );
      const result = await checkBatch(root, "batch-one");
      assert.deepEqual(
        result.sources.map((source) => source.original),
        ["pass", "not_run_approved_unreadable"],
      );
      assert.match(result.body, /未執行：原文無法讀取/);
      assert.doesNotMatch(result.body, /工具無法讀取|非真人決定/);
      const formal = join(root, "content/spots/approved-park/spot.yaml");
      await writeFile(
        formal,
        (await readFile(formal, "utf8")).replace(
          "已發布測試公園",
          "其他人剛發布的新版本",
        ),
      );
      await assert.rejects(checkBatch(root, "batch-one"), /審閱基準/);
    } finally {
      await cleanup();
    }
  },
);
