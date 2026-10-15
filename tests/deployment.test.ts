import test from "node:test";
import assert from "node:assert/strict";
import {
  readFile,
  writeFile,
  rm,
  mkdir,
  copyFile,
  mkdtemp,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { workspace } from "./helpers/workspace.ts";
import { checkDeployment } from "../scripts/check-deployment.ts";

const exec = promisify(execFile);
test(
  "deployment blocks empty, copied fixtures and private artifacts; accepts formal output",
  { timeout: 120_000 },
  async () => {
    const work = await workspace();
    const file = join(work.root, "content/spots/approved-park/spot.yaml");
    const original = await readFile(file, "utf8");
    const build = () =>
      exec(process.execPath, ["scripts/site.mjs", "build"], { cwd: work.root });
    try {
      await build();
      await assert.rejects(checkDeployment(work.root), /fixture|測試|虛構/);
      await writeFile(
        file,
        original
          .replaceAll("範例", "驗收")
          .replaceAll("（虛構）", "")
          .replaceAll("example.org", "acceptance.invalid"),
      );
      await build();
      assert.equal(await checkDeployment(work.root), 1);
      await copyFile("wrangler.jsonc", join(work.root, "wrangler.jsonc"));
      await exec("pnpm", ["check:worker"], {
        cwd: work.root,
        env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      });
      await mkdir(join(work.root, "dist/research"));
      await writeFile(
        join(work.root, "dist/research/private.md"),
        "private test record",
      );
      await assert.rejects(checkDeployment(work.root), /私人/);
      await rm(join(work.root, "dist/research"), { recursive: true });
      await rm(join(work.root, "content/spots/approved-park"), {
        recursive: true,
      });
      await build();
      await assert.rejects(checkDeployment(work.root), /至少一/);
    } finally {
      await work.cleanup();
    }
  },
);

test("production workflow exposes credentials only after formal validation", async () => {
  const { parse } = await import("yaml");
  const flow = parse(await readFile(".github/workflows/deploy.yml", "utf8"));
  assert.deepEqual(flow.on, { push: { branches: ["main"] } });
  assert.deepEqual(flow.permissions, { contents: "read" });
  assert.equal(flow.concurrency["cancel-in-progress"], false);
  assert.equal(flow.jobs.deploy.needs, "verify");
  assert.match(flow.jobs.deploy.if, /github.triggering_actor == 'CarlLee1983'/);
  assert.match(flow.jobs.deploy.if, /github.actor == 'CarlLee1983'/);
  assert.match(flow.jobs.deploy.if, /github.ref == 'refs\/heads\/main'/);
  assert.match(
    flow.jobs.deploy.if,
    /github.repository == 'CarlLee1983\/CarlTravel'/,
  );
  assert.equal(flow.jobs.deploy.environment.name, "production");
  assert.doesNotMatch(JSON.stringify(flow.jobs.verify), /secrets\./);
  assert.ok(
    flow.jobs.verify.steps.some(
      (step: { run?: string }) => step.run === "pnpm verify",
    ),
  );
  const steps = flow.jobs.deploy.steps;
  const prepare = steps.findIndex(
    (step: { run?: string }) => step.run === "pnpm prepare:deployment",
  );
  const deploy = steps.findIndex((step: { run?: string }) =>
    step.run?.includes("pnpm exec wrangler deploy"),
  );
  assert.ok(prepare >= 0 && deploy > prepare);
  assert.equal(
    steps.filter((step: unknown) => JSON.stringify(step).includes("secrets."))
      .length,
    1,
  );
  assert.ok(steps[deploy].env.CLOUDFLARE_API_TOKEN.includes("secrets."));
  assert.equal(steps[0].with.ref, "${{ github.sha }}");
});

test("deployment freshness gate rejects old main, empty replies and lookup failures", async () => {
  const { parse } = await import("yaml");
  const flow = parse(await readFile(".github/workflows/deploy.yml", "utf8"));
  const steps = flow.jobs.deploy.steps;
  const gateIndex = steps.findIndex(
    (step: { name: string }) =>
      step.name === "Require current main before deployment",
  );
  assert.equal(steps[gateIndex - 1].run, "pnpm prepare:deployment");
  assert.ok(steps[gateIndex + 1].env.CLOUDFLARE_API_TOKEN);
  const gate = steps[gateIndex];
  assert.equal(gate.shell, "bash");
  assert.doesNotMatch(JSON.stringify(gate), /secrets\./);
  const root = await mkdtemp(join(tmpdir(), "carltravel-main-head-"));
  try {
    await writeFile(
      join(root, "git"),
      '#!/bin/sh\nprintf "%s\\trefs/heads/main\\n" "$TEST_MAIN_SHA"\nexit "${TEST_GIT_EXIT:-0}"\n',
      { mode: 0o755 },
    );
    const run = (head: string, status = "0") =>
      exec(
        "bash",
        ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", gate.run],
        {
          env: {
            ...process.env,
            PATH: `${root}:${process.env.PATH}`,
            GITHUB_SHA: "current-sha",
            TEST_MAIN_SHA: head,
            TEST_GIT_EXIT: status,
          },
        },
      );
    await run("current-sha");
    await assert.rejects(run("old-sha"));
    await assert.rejects(run(""));
    await assert.rejects(run("current-sha", "1"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
