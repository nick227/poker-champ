import "dotenv/config";
import { getPrisma, disconnectPrisma } from "../apps/server/src/db/prisma.js";

async function main() {
  const apply = process.argv.includes("--apply");
  const prisma = getPrisma() as any;

  const legacyLessons = await prisma.lesson.findMany({
    where: {
      id: { startsWith: "lesson_" },
    },
    select: { id: true, title: true },
    orderBy: { id: "asc" },
  });

  if (legacyLessons.length === 0) {
    // eslint-disable-next-line no-console
    console.log("No legacy lesson_* rows found.");
    return;
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        count: legacyLessons.length,
        lessonIds: legacyLessons.map((lesson: any) => lesson.id),
      },
      null,
      2,
    ),
  );

  if (!apply) {
    // eslint-disable-next-line no-console
    console.log("Dry run only. Re-run with --apply to delete legacy rows.");
    return;
  }

  await prisma.lesson.deleteMany({
    where: {
      id: { in: legacyLessons.map((lesson: any) => lesson.id) },
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Deleted ${legacyLessons.length} legacy lesson_* rows.`);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("cleanup-legacy-lessons failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma().catch(() => undefined);
  });
