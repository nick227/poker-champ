import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPrisma, disconnectPrisma } from "../src/db/prisma.js";

type LockFile = {
  curriculumTag: string;
  lessonCount: number;
  stepCount: number;
  gradingVersion: number;
  distributionKey: {
    type: string;
    buckets: string[];
  };
};

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function readLockFile(root: string): Promise<LockFile> {
  const lockPath = path.resolve(root, "content/lessons/content/curriculum.lock.json");
  const raw = await fs.readFile(lockPath, "utf8");
  return JSON.parse(raw) as LockFile;
}

async function readCanonicalLessonIds(root: string): Promise<string[]> {
  const contentRoot = path.resolve(root, "content/lessons/content");
  const entries = await fs.readdir(contentRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && /^L\d{2}$/i.test(entry.name))
    .map((entry) => entry.name.toUpperCase())
    .sort((a, b) => a.localeCompare(b));
}

async function run() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const lock = await readLockFile(root);
  const lessonIds = await readCanonicalLessonIds(root);
  const prisma = getPrisma() as any;

  assertCondition(lessonIds.length === lock.lessonCount, `Lock mismatch: expected ${lock.lessonCount} lesson dirs, found ${lessonIds.length}`);

  const lessons = await prisma.lesson.findMany({
    where: { id: { in: lessonIds }, status: "PUBLISHED" },
    select: { id: true },
  });
  assertCondition(lessons.length === lock.lessonCount, `Published lesson count mismatch: expected ${lock.lessonCount}, found ${lessons.length}`);

  const steps = await prisma.lessonStep.findMany({
    where: { lessonId: { in: lessonIds } },
    select: { id: true, lessonId: true, type: true, gradingVersion: true, gradingSpecJson: true },
  });
  assertCondition(steps.length === lock.stepCount, `Step count mismatch: expected ${lock.stepCount}, found ${steps.length}`);

  const badGradingVersion = steps.find((step: any) => (step.gradingVersion ?? null) !== lock.gradingVersion);
  assertCondition(!badGradingVersion, `Unexpected gradingVersion on step ${badGradingVersion?.id}`);

  const actionSteps = steps.filter((step: any) => step.type === "ACTION_STEP");
  assertCondition(actionSteps.length > 0, "No ACTION_STEP rows found for canonical curriculum");

  let objectiveCount = 0;
  let rubricCount = 0;
  for (const step of actionSteps as any[]) {
    const spec = step.gradingSpecJson as Record<string, unknown> | null;
    const mode = typeof spec?.gradingMode === "string" ? spec.gradingMode : null;
    if (mode === "OBJECTIVE_SINGLE") objectiveCount += 1;
    if (mode === "RUBRIC_SUBJECTIVE") rubricCount += 1;

    const distributionKey = (spec?.distributionKey ?? null) as Record<string, unknown> | null;
    assertCondition(distributionKey != null, `Missing distributionKey on ACTION_STEP ${step.id}`);
    assertCondition(distributionKey.type === lock.distributionKey.type, `Unexpected distributionKey.type on ${step.id}`);
    const buckets = Array.isArray(distributionKey.buckets) ? distributionKey.buckets : [];
    assertCondition(
      JSON.stringify(buckets) === JSON.stringify(lock.distributionKey.buckets),
      `Unexpected distributionKey.buckets on ${step.id}`,
    );
  }

  assertCondition(objectiveCount === 10, `Expected 10 OBJECTIVE_SINGLE action steps, found ${objectiveCount}`);
  assertCondition(rubricCount === 5, `Expected 5 RUBRIC_SUBJECTIVE action steps, found ${rubricCount}`);

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        curriculumTag: lock.curriculumTag,
        lessonCount: lessons.length,
        stepCount: steps.length,
        actionSteps: actionSteps.length,
        objectiveSingle: objectiveCount,
        rubricSubjective: rubricCount,
      },
      null,
      2,
    ),
  );
}

run()
  .then(async () => {
    await disconnectPrisma();
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error("Lessons seed integrity check failed:", error?.message ?? error);
    await disconnectPrisma();
    process.exit(1);
  });

