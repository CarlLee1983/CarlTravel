import { spawn } from "node:child_process";

const command = process.argv[2] ?? "";
const options = process.argv.slice(3);
const fixture = options[0] === "fixture";
const rest = options.slice(fixture ? 1 : 0).filter((option) => option !== "--");

if (
  !new Set(["dev", "build", "preview", "check-content"]).has(command) ||
  (command === "check-content" && rest.length > 0)
) {
  console.error(
    "Usage: node scripts/site.mjs <dev|build|preview|check-content> [fixture]",
  );
  process.exit(2);
}

const env = { ...process.env };
delete env.CARLTRAVEL_FIXTURE;
if (fixture) env.CARLTRAVEL_FIXTURE = "1";

const args =
  command === "check-content"
    ? ["--experimental-strip-types", "scripts/check-content.ts"]
    : [
        "exec",
        "astro",
        command,
        ...(command === "build" ? ["--force"] : []),
        ...rest,
      ];
const executable = command === "check-content" ? process.execPath : "pnpm";
const child = spawn(executable, args, { env, stdio: "inherit" });
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
