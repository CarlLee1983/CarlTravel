import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { workspace, devServer } from "./helpers/workspace.ts";

test(
  "live drafts update and stay out of Git and the subsequent formal build",
  { timeout: 120_000 },
  async () => {
    const { root, cleanup } = await workspace();
    const original = await readFile(
      join(root, "content/spots/approved-park/spot.yaml"),
      "utf8",
    );
    for (const [id, name] of [
      ["approved-park", "修訂公園專有文字"],
      ["new-draft", "新草稿專有文字"],
    ]) {
      await mkdir(join(root, "drafts/spots", id!), { recursive: true });
      await writeFile(
        join(root, "drafts/spots", id!, "spot.yaml"),
        original.replace("範例親子公園", name!),
      );
    }
    const server = await devServer(root);
    try {
      const home = await server.waitFor("/", (_html, status) => status === 200);
      assert.match(home, /新草稿專有文字/);
      assert.match(home, /修訂公園專有文字/);
      assert.match(home, /修訂中/);
      assert.match(home, /新草稿/);
      const revision = await server.waitFor("/spots/approved-park/", (html) =>
        html.includes("修訂公園專有文字"),
      );
      assert.match(revision, /修訂中/);
      assert.match(revision, /noindex, nofollow/);
      assert.equal(
        await readFile(
          join(root, "content/spots/approved-park/spot.yaml"),
          "utf8",
        ),
        original,
      );
      await writeFile(
        join(root, "drafts/spots/approved-park/spot.yaml"),
        original.replace("範例親子公園", "更新後修訂文字"),
      );
      await server.waitFor(
        "/spots/approved-park/",
        (html, status) => status === 200 && html.includes("更新後修訂文字"),
      );
      await rm(join(root, "drafts/spots/approved-park"), { recursive: true });
      const restored = await server.waitFor(
        "/spots/approved-park/",
        (html, status) => status === 200 && html.includes("範例親子公園"),
      );
      assert.doesNotMatch(restored, /修訂中/);
      await mkdir(join(root, "drafts/spots/late-draft"));
      await writeFile(
        join(root, "drafts/spots/late-draft/spot.yaml"),
        original.replace("範例親子公園", "後加入的草稿"),
      );
      await server.waitFor(
        "/spots/late-draft/",
        (html, status) => status === 200 && html.includes("後加入的草稿"),
      );
      await rm(join(root, "drafts/spots/late-draft"), { recursive: true });
      await server.waitFor(
        "/spots/late-draft/",
        (_html, status) => status === 404,
      );
      await mkdir(join(root, "drafts/spots/approved-park"));
      await writeFile(
        join(root, "drafts/spots/approved-park/spot.yaml"),
        original.replace("範例親子公園", "修訂公園專有文字"),
      );
      await server.waitFor(
        "/spots/approved-park/",
        (html, status) => status === 200 && html.includes("修訂公園專有文字"),
      );
      await server.stop();
      await mkdir(join(root, "research/synthetic-source"), { recursive: true });
      await writeFile(
        join(root, "research/synthetic-source/original.txt"),
        "researchprivateprobe",
      );
      execFileSync("git", ["init", "--quiet"], { cwd: root });
      execFileSync("git", ["add", "."], { cwd: root, stdio: "pipe" });
      const tracked = execFileSync("git", ["ls-files"], {
        cwd: root,
        encoding: "utf8",
      });
      assert.doesNotMatch(tracked, /^(drafts|research)\//m);
      const ignored = execFileSync(
        "git",
        [
          "check-ignore",
          "drafts/spots/new-draft/spot.yaml",
          "research/synthetic-source/original.txt",
        ],
        { cwd: root, encoding: "utf8" },
      );
      assert.match(ignored, /drafts\/spots\/new-draft/);
      assert.match(ignored, /research\/synthetic-source/);
      execFileSync(process.execPath, ["scripts/site.mjs", "build"], {
        cwd: root,
        env: {
          ...process.env,
          NODE_ENV: "development",
          CARLTRAVEL_FIXTURE: "1",
          CARLTRAVEL_DRAFTS: "true",
        },
        stdio: "pipe",
        timeout: 60_000,
      });
      const formalHtml = await readFile(
        join(root, "dist/spots/approved-park/index.html"),
        "utf8",
      );
      assert.match(formalHtml, /範例親子公園/);
      assert.doesNotMatch(formalHtml, /修訂中|本機草稿預覽|修訂公園專有文字/);
      assert.deepEqual(await readdir(join(root, "dist/spots")), [
        "approved-park",
      ]);
      async function inspect(dir: string): Promise<void> {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
          assert.ok(!["drafts", "research"].includes(entry.name));
          const path = join(dir, entry.name);
          if (entry.isDirectory()) await inspect(path);
          else if (/\.(html|js|json|xml|txt)$/.test(entry.name))
            assert.doesNotMatch(
              await readFile(path, "utf8"),
              /new-draft|修訂公園專有文字|新草稿專有文字|researchprivateprobe|本機草稿預覽/,
            );
        }
      }
      await inspect(join(root, "dist"));
    } finally {
      await server.stop();
      await cleanup();
    }
  },
);

test(
  "private draft YAML and research cannot be fetched as development assets",
  { timeout: 60_000 },
  async () => {
    const { root, cleanup } = await workspace();
    await mkdir(join(root, "drafts/spots/private-draft"), { recursive: true });
    await mkdir(join(root, "research/synthetic-source"), { recursive: true });
    const original = await readFile(
      join(root, "content/spots/approved-park/spot.yaml"),
      "utf8",
    );
    await writeFile(
      join(root, "drafts/spots/private-draft/spot.yaml"),
      original.replace("範例親子公園", "privateassetprobe"),
    );
    await writeFile(
      join(root, "research/synthetic-source/original.txt"),
      "researchassetprobe",
    );
    const server = await devServer(root);
    try {
      await server.waitFor("/", (_html, status) => status === 200);
      for (const path of [
        "drafts/spots/private-draft/spot.yaml",
        "research/synthetic-source/original.txt",
      ]) {
        for (const url of [
          `/${path}`,
          `/@fs/${join(root, path)}`,
          `/@fs/${join(root, path)}?raw`,
        ]) {
          const response = await fetch(server.base + url);
          assert.ok(response.status >= 400, url);
          assert.doesNotMatch(
            await response.text(),
            /privateassetprobe|researchassetprobe/,
          );
        }
      }
    } finally {
      await server.stop();
      await cleanup();
    }
  },
);

test(
  "missing drafts are optional, but invalid drafts and images fail preview instead of showing stale formal content",
  { timeout: 120_000 },
  async () => {
    const { root, cleanup } = await workspace();
    const original = await readFile(
      join(root, "content/spots/approved-park/spot.yaml"),
      "utf8",
    );
    const server = await devServer(root);
    try {
      await server.waitFor(
        "/spots/approved-park/",
        (html, status) => status === 200 && html.includes("範例親子公園"),
      );
      const draft = join(root, "drafts/spots/approved-park/spot.yaml");
      await mkdir(join(root, "drafts/spots/approved-park"), {
        recursive: true,
      });
      await writeFile(
        draft,
        original.replace("county: 臺北市", "county: 不存在市"),
      );
      await server.waitFor(
        "/spots/approved-park/",
        (_html, status) => status === 500,
      );
      await writeFile(
        draft,
        original.replace("範例親子公園", "修正後有效草稿"),
      );
      await server.waitFor(
        "/spots/approved-park/",
        (html, status) => status === 200 && html.includes("修正後有效草稿"),
      );
      await writeFile(
        join(root, "drafts/spots/approved-park/photo.png"),
        "syntheticprivateimage",
      );
      await server.waitFor(
        "/spots/approved-park/",
        (_html, status) => status === 500,
      );
      await rm(join(root, "drafts/spots/approved-park/photo.png"));
      await writeFile(
        draft,
        original.replace(
          "summary: 沿著步道觀察樹木與季節變化。",
          "summary: '![](https://example.org/private.png)'",
        ),
      );
      await server.waitFor(
        "/spots/approved-park/",
        (_html, status) => status === 500,
      );
      await server.stop();
      execFileSync(process.execPath, ["scripts/site.mjs", "build"], {
        cwd: root,
        stdio: "pipe",
        timeout: 60_000,
      });
      const html = await readFile(
        join(root, "dist/spots/approved-park/index.html"),
        "utf8",
      );
      assert.match(html, /範例親子公園/);
      assert.doesNotMatch(html, /修正後有效草稿|private.png|修訂中/);
    } finally {
      await server.stop();
      await cleanup();
    }
  },
);

test(
  "fixture development never reads local drafts",
  { timeout: 60_000 },
  async () => {
    const { root, cleanup } = await workspace();
    await mkdir(join(root, "drafts/spots/example-park"), { recursive: true });
    await writeFile(
      join(root, "drafts/spots/example-park/spot.yaml"),
      "invalid: privatefixtureprobe",
    );
    const server = await devServer(root, true);
    try {
      const home = await server.waitFor("/", (_html, status) => status === 200);
      assert.match(home, /開發展示 · 虛構景點與出處/);
      assert.match(home, /範例親子公園/);
      assert.match(home, /範例探索館/);
      assert.doesNotMatch(home, /本機草稿預覽|privatefixtureprobe/);
    } finally {
      await server.stop();
      await cleanup();
    }
  },
);
