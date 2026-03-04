import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";

function getPnpmExecutable() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

export default async function globalSetup() {
  if (process.env.VITEST_LESSONS_AUTOSEED === "0") return;
  if (!process.env.DATABASE_URL) return;

  const prisma = new PrismaClient();
  try {
    let lessonCount = 0;
    try {
      lessonCount = await prisma.lesson.count();
    } catch (error) {
      // Do not block unit tests when DB/migrations are unavailable.
      // This auto-seed is best-effort for DB-backed test environments.
      console.warn("[vitest] Lessons auto-seed skipped: unable to query lessons table.", error);
      return;
    }

    if (lessonCount > 0) return;

    console.log("[vitest] Lessons table empty. Running lessons:seed:legacy...");
    const result = spawnSync(getPnpmExecutable(), ["lessons:seed:legacy"], {
      stdio: "inherit",
      env: process.env,
    });

    if (result.status !== 0) {
      throw new Error(`lessons:seed:legacy failed with exit code ${result.status ?? "unknown"}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
