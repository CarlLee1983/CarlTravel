import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { workspace, devServer } from "./helpers/workspace.ts";

test(
  "synthetic research reaches preview and a complete review while retaining both human decision boundaries",
  { timeout: 60_000 },
  async () => {
    const { root, cleanup } = await workspace();
    const run = (...args: string[]) =>
      execFileSync(
        process.execPath,
        ["--experimental-strip-types", "scripts/research.ts", ...args],
        { cwd: root, encoding: "utf8", stdio: "pipe" },
      );
    try {
      const originalFormal = await readFile(
        join(root, "content/spots/approved-park/spot.yaml"),
        "utf8",
      );
      const data = parse(originalFormal);
      const { sourceId } = JSON.parse(
        run("init", "2026-10-15", "synthetic", "https://example.org/synthetic"),
      );
      const dir = join(root, "research", sourceId);
      const incoming = join(dir, "incoming.txt");
      await writeFile(
        incoming,
        "虛構作者寫下沿著小徑辨識植物的造訪描述。這是測試原文，不是真實來源。",
      );
      run("capture", sourceId, "defuddle", incoming);
      const identity = JSON.parse(run("match", data.name, data.address));
      assert.equal(identity.id, "approved-park");
      assert.match(
        await readFile(join(dir, "spots.md"), "utf8"),
        /## Carl 勾選與日期\n待確認/,
      );
      assert.match(await readFile(join(dir, "review.md"), "utf8"), /待完成/);
      // A synthetic decision belongs to this test only; the tool never supplies it.
      await writeFile(
        join(dir, "spots.md"),
        "# 拆分與勾選\n\n## 新建或明確補充\napproved-park：明確補充\n\n## 周邊安排\n無\n\n## 略過\n無\n\n## 同一性待確認\n無\n\n## Carl 勾選與日期\n虛構驗收決定：2026-10-15，勾選 approved-park。\n\n## 本批與待續\n本批 approved-park；待續無。\n",
      );
      execFileSync(
        process.execPath,
        [
          "--experimental-strip-types",
          "scripts/draft.ts",
          "copy",
          "approved-park",
        ],
        { cwd: root, stdio: "pipe" },
      );
      data.sources = [
        {
          id: sourceId,
          title: "虛構來源",
          author: "範例作者",
          url: "https://example.org/synthetic",
          readAt: "2026-10-15",
          readable: true,
        },
      ];
      data.authorNotes = [
        { source: sourceId, summary: "作者提到步道可觀察樹木。", quotes: [] },
      ];
      data.transport.checkedAt = "2026-10-16";
      data.summary = "依步道動線安排植物觀察。";
      await writeFile(
        join(root, "drafts/spots/approved-park/spot.yaml"),
        stringify(data),
      );
      await writeFile(
        join(dir, "official-log.md"),
        "# 官方查證\n\n虛構驗收：只重查交通。官網 https://example.org/park 已取得入口公告；主管機關與觀光網本次無須補查，未標未知。其他分節日期保留。\n",
      );
      const checked = JSON.parse(run("check", "approved-park"));
      assert.equal(checked.ok, true);
      const diff = execFileSync(
        process.execPath,
        [
          "--experimental-strip-types",
          "scripts/draft.ts",
          "diff",
          "approved-park",
        ],
        { cwd: root, encoding: "utf8" },
      );
      assert.match(diff, /2026-10-16/);
      assert.equal(
        data.hoursAndFees.checkedAt,
        parse(originalFormal).hoursAndFees.checkedAt,
      );
      const server = await devServer(root);
      try {
        const page = await server.waitFor(
          "/spots/approved-park/",
          (html, status) =>
            status === 200 && html.includes("作者提到步道可觀察樹木。"),
        );
        assert.match(page, /修訂中/);
        await writeFile(
          join(dir, "review.md"),
          `# 送審清單\n\n## 景點清單與修訂差異\n補充 approved-park；pnpm draft:diff approved-park\n\n## 衝突\n無\n\n## 官方未公布\n無\n\n## 推估與疑點\n無\n\n## 不可讀官方頁\n無\n\n## 可疑內容\n無\n\n## 重疊檢查結果\n原文 pass，私人備註 pass；詳細診斷留本機。\n\n## 預覽網址\n${server.base}/spots/approved-park/\n\n等待 Carl 審閱；尚未核准發布。\n`,
        );
      } finally {
        await server.stop();
      }
      const review = await readFile(join(dir, "review.md"), "utf8");
      assert.doesNotMatch(review, /待完成/);
      assert.match(review, /等待 Carl 審閱/);
      assert.equal(
        await readFile(
          join(root, "content/spots/approved-park/spot.yaml"),
          "utf8",
        ),
        originalFormal,
      );
      // Errors expose a local report path, never private YAML parser snippets.
      await writeFile(
        join(root, "drafts/spots/approved-park/spot.yaml"),
        "name: [privateparserprobe",
      );
      const failed = spawnSync(
        process.execPath,
        [
          "--experimental-strip-types",
          "scripts/research.ts",
          "check",
          "approved-park",
        ],
        { cwd: root, encoding: "utf8" },
      );
      assert.equal(failed.status, 1);
      assert.doesNotMatch(failed.stdout + failed.stderr, /privateparserprobe/);
      assert.match(
        await readFile(join(root, "research/overlap-report.md"), "utf8"),
        /privateparserprobe/,
      );
    } finally {
      await cleanup();
    }
  },
);
