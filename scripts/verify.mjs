import { spawnSync } from "node:child_process";

const env = { ...process.env };
delete env.CARLTRAVEL_FIXTURE;

const steps = [
  "format:check",
  "check",
  "check:content",
  "test",
  "build",
  "test:e2e",
  // The last build validates formal output after fixture E2E.
  "build",
  "check:output",
];

for (const script of steps) {
  console.log(`\n> pnpm ${script}`);
  const result = spawnSync("pnpm", [script], { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.signal) process.kill(process.pid, result.signal);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
