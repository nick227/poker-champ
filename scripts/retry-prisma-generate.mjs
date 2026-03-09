import { spawnSync } from "child_process";
import { setTimeout } from "timers/promises";

const maxAttempts = 10;
const baseDelayMs = 500;

function shouldRetryPrismaGenerate(message) {
  return (
    message.includes("EPERM") ||
    message.includes("EBUSY") ||
    message.includes("operation not permitted, rename") ||
    message.includes("query_engine-windows.dll.node.tmp") ||
    message.includes("query_engine-windows.dll.node")
  );
}

function runPrismaGenerate() {
  const result = spawnSync("pnpm", ["exec", "prisma", "generate"], {
    shell: process.platform === "win32",
    encoding: "utf8",
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const combinedOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const exitCode = result.status ?? 1;

  return { exitCode, combinedOutput };
}

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const { exitCode, combinedOutput } = runPrismaGenerate();
  if (exitCode === 0) process.exit(0);

  if (!shouldRetryPrismaGenerate(combinedOutput) || attempt === maxAttempts) {
    process.exit(exitCode);
  }

  const delayMs = Math.min(20_000, baseDelayMs * 2 ** (attempt - 1));
  console.warn(
    `prisma generate failed (Windows file lock). Retrying in ${Math.round(delayMs / 100) / 10}s...`,
  );
  await setTimeout(delayMs);
}
