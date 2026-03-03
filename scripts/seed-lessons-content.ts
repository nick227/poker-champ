import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TableSnapshotPayloadSchema, type TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { getPrisma, disconnectPrisma } from "../src/db/prisma.js";

type StepConfigOption = {
  optionKey: string;
  label: string;
  value?: unknown;
  displayOrder: number;
  isCorrect?: boolean;
};

type StepConfigStep = {
  id: string;
  sequence: number;
  type: "INFO_STEP" | "MCQ_STEP" | "ACTION_STEP";
  snapshotVersion?: number;
  snapshotPath?: string;
  gradingVersion: number;
  beforeInstructorMessage?: string;
  question?: string;
  followUpInstructorMessage?: string;
  gradingSpecJson?: Record<string, unknown>;
  options?: StepConfigOption[];
};

type LessonStepConfig = {
  lessonId: string;
  title: string;
  moduleCode: "MODULE_A" | "MODULE_B" | "MODULE_C";
  recommendedOrder: number;
  role: "teaches" | "drills" | "tests";
  repeatable: boolean;
  version?: number;
  difficulty?: string;
  estimatedMinutes?: number;
  curriculumVersion?: string;
  steps: StepConfigStep[];
};

function toDifficulty(raw: string | undefined): string {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "beginner" || value === "intermediate" || value === "advanced") return value;
  return "intermediate";
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function parseArgs(argv: string[]) {
  return {
    replaceNonCanonical: argv.includes("--replace-noncanonical"),
  };
}

async function readJson<T>(targetPath: string): Promise<T> {
  const raw = await fs.readFile(targetPath, "utf8");
  return JSON.parse(raw) as T;
}

async function readLessonDescription(lessonDir: string): Promise<string | null> {
  const lessonPath = path.resolve(lessonDir, "lesson.md");
  try {
    const content = await fs.readFile(lessonPath, "utf8");
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("- "));
    if (!lines.length) return null;
    return lines[0].slice(0, 280);
  } catch {
    return null;
  }
}

async function loadCanonicalLessons(contentRoot: string): Promise<
  Array<{
    config: LessonStepConfig;
    lessonDir: string;
    description: string | null;
  }>
> {
  const entries = await fs.readdir(contentRoot, { withFileTypes: true });
  const lessonDirs = entries
    .filter((entry) => entry.isDirectory() && /^L\d{2}$/i.test(entry.name))
    .map((entry) => path.resolve(contentRoot, entry.name))
    .sort((a, b) => a.localeCompare(b));

  const loaded: Array<{ config: LessonStepConfig; lessonDir: string; description: string | null }> = [];
  for (const lessonDir of lessonDirs) {
    const configPath = path.resolve(lessonDir, "step-config.json");
    const config = await readJson<LessonStepConfig>(configPath);
    const description = await readLessonDescription(lessonDir);
    loaded.push({ config, lessonDir, description });
  }
  return loaded;
}

async function seedLessons() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const contentRoot = path.resolve(root, "docs/lessons/content");
  const prisma = getPrisma() as any;
  const lessons = await loadCanonicalLessons(contentRoot);

  const canonicalLessonIds = new Set(lessons.map((item) => item.config.lessonId));
  if (args.replaceNonCanonical) {
    await prisma.lesson.deleteMany({
      where: {
        id: {
          notIn: Array.from(canonicalLessonIds),
        },
      },
    });
  }

  for (const { config, lessonDir, description } of lessons) {
    const lessonId = config.lessonId;
    const stepIds = config.steps.map((step) => step.id);
    const difficulty = toDifficulty(config.difficulty);
    const version = typeof config.version === "number" && Number.isFinite(config.version) ? config.version : 1;

    await prisma.lesson.upsert({
      where: { id: lessonId },
      create: {
        id: lessonId,
        slug: `${lessonId.toLowerCase()}-${slugify(config.title)}`,
        title: config.title,
        description,
        moduleCode: config.moduleCode,
        recommendedOrder: config.recommendedOrder,
        role: config.role,
        repeatable: config.repeatable,
        curriculumVersion: config.curriculumVersion ?? null,
        difficulty,
        status: "PUBLISHED",
        estimatedMinutes: config.estimatedMinutes ?? null,
        version,
        tier: "free",
        applyCtaText: "Start Lesson",
      },
      update: {
        slug: `${lessonId.toLowerCase()}-${slugify(config.title)}`,
        title: config.title,
        description,
        moduleCode: config.moduleCode,
        recommendedOrder: config.recommendedOrder,
        role: config.role,
        repeatable: config.repeatable,
        curriculumVersion: config.curriculumVersion ?? null,
        difficulty,
        status: "PUBLISHED",
        estimatedMinutes: config.estimatedMinutes ?? null,
        version,
        tier: "free",
        applyCtaText: "Start Lesson",
      },
    });

    await prisma.contentAccess.upsert({
      where: {
        contentId_type: {
          contentId: lessonId,
          type: "lesson",
        },
      },
      create: {
        contentId: lessonId,
        type: "lesson",
        isPremium: false,
        requiredTier: null,
      },
      update: {
        isPremium: false,
        requiredTier: null,
      },
    });

    await prisma.lessonStep.deleteMany({
      where: {
        lessonId,
        id: { notIn: stepIds },
      },
    });

    for (const step of config.steps) {
      let snapshotJson: TableSnapshotPayload | null = null;
      if (step.snapshotPath) {
        const snapshotPath = path.resolve(lessonDir, step.snapshotPath);
        const snapshotRaw = await readJson<unknown>(snapshotPath);
        snapshotJson = TableSnapshotPayloadSchema.parse(snapshotRaw);
      }

      await prisma.lessonStep.upsert({
        where: { id: step.id },
        create: {
          id: step.id,
          lessonId,
          sequence: step.sequence,
          type: step.type,
          snapshotVersion: step.snapshotVersion ?? 1,
          snapshotJson,
          gradingVersion: step.gradingVersion ?? 1,
          beforeMessage: step.beforeInstructorMessage ?? null,
          questionText: step.question ?? null,
          followUpMessage: step.followUpInstructorMessage ?? null,
          gradingSpecJson: step.gradingSpecJson ?? null,
          explanationJson: null,
        },
        update: {
          lessonId,
          sequence: step.sequence,
          type: step.type,
          snapshotVersion: step.snapshotVersion ?? 1,
          snapshotJson,
          gradingVersion: step.gradingVersion ?? 1,
          beforeMessage: step.beforeInstructorMessage ?? null,
          questionText: step.question ?? null,
          followUpMessage: step.followUpInstructorMessage ?? null,
          gradingSpecJson: step.gradingSpecJson ?? null,
          explanationJson: null,
        },
      });

      await prisma.lessonStepOption.deleteMany({ where: { stepId: step.id } });
      for (const option of step.options ?? []) {
        await prisma.lessonStepOption.create({
          data: {
            id: `${step.id}_opt_${option.optionKey}`,
            stepId: step.id,
            optionKey: option.optionKey,
            label: option.label,
            valueJson: option.value ?? { optionKey: option.optionKey },
            displayOrder: option.displayOrder,
            isCorrect: option.isCorrect ?? false,
          },
        });
      }
    }
  }

  const publishedLessons = await prisma.lesson.count({ where: { status: "PUBLISHED" } });
  const totalSteps = await prisma.lessonStep.count({
    where: {
      lessonId: {
        in: Array.from(canonicalLessonIds),
      },
    },
  });

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        seededLessons: lessons.length,
        publishedLessons,
        totalSteps,
        curriculumVersion: lessons[0]?.config.curriculumVersion ?? null,
        replaceNonCanonical: args.replaceNonCanonical,
      },
      null,
      2,
    ),
  );
}

seedLessons()
  .then(async () => {
    await disconnectPrisma();
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error("Failed to seed lessons from content:", error);
    await disconnectPrisma();
    process.exit(1);
  });
