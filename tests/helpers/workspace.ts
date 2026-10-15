import { cp, mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// A disposable app keeps synthetic drafts away from the user's private directories.
export async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "carltravel-preview-"));
  for (const path of [
    "src",
    "scripts",
    "astro.config.mjs",
    "package.json",
    "pnpm-workspace.yaml",
    "pnpm-lock.yaml",
    "tsconfig.json",
    ".gitignore",
  ])
    await cp(path, join(root, path), { recursive: true });
  await symlink(resolve("node_modules"), join(root, "node_modules"), "dir");
  await mkdir(join(root, "content/spots"), { recursive: true });
  await cp(
    "tests/fixtures/spots/example-park",
    join(root, "content/spots/approved-park"),
    { recursive: true },
  );
  await cp("tests/fixtures/spots", join(root, "tests/fixtures/spots"), {
    recursive: true,
  });
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

export async function devServer(root: string, fixture = false) {
  const { spawn } = await import("node:child_process");
  const { createServer } = await import("node:net");
  const reservation = createServer();
  await new Promise<void>((done) => reservation.listen(0, "127.0.0.1", done));
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const port = address.port;
  await new Promise<void>((done) => reservation.close(() => done()));
  const child = spawn(
    process.execPath,
    [
      "scripts/site.mjs",
      "dev",
      ...(fixture ? ["fixture"] : []),
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: root,
      env: { ...process.env, ASTRO_DEV_BACKGROUND: "1" },
      detached: true,
      stdio: "pipe",
    },
  );
  let stopped = false;
  let log = "";
  child.stdout.on("data", (data) => {
    log += data;
  });
  child.stderr.on("data", (data) => {
    log += data;
  });
  const base = `http://127.0.0.1:${port}`;
  return {
    base,
    async waitFor(
      path: string,
      accept: (html: string, status: number) => boolean,
    ) {
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        try {
          const response = await fetch(base + path, {
            signal: AbortSignal.timeout(2000),
          });
          const html = await response.text();
          if (accept(html, response.status)) return html;
        } catch {
          /* Server may be starting or restarting. */
        }
        if (child.exitCode !== null) break;
        await new Promise((done) => setTimeout(done, 100));
      }
      throw new Error(
        `Dev response did not match ${path}\n${log.slice(-5000)}`,
      );
    },
    async stop() {
      if (stopped || child.exitCode !== null || !child.pid) return;
      stopped = true;
      const exited = new Promise<void>((done) =>
        child.once("exit", () => done()),
      );
      process.kill(-child.pid, "SIGTERM");
      await exited;
    },
  };
}
