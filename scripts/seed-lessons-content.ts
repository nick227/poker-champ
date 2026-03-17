import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TableSnapshotPayloadSchema, type TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { getPrisma, disconnectPrisma } from "@poker-champ/db";
import { normalizeActionStepSnapshot } from "../apps/server/src/lessons/normalizeActionStepSnapshot.js";

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
  lessonType?: "STANDALONE" | "FULL_HAND_GHOST";
  /** Ghost lessons: hero must be in this seat in every snapshot. If omitted, inferred from first snapshot and consistency enforced. */
  heroSeat?: number;
  /** Optional hand ID for "Watch the full hand" replay link (ghost lessons). */
  replayHandId?: string;
  moduleCode: "MODULE_A" | "MODULE_B" | "MODULE_C" | "MODULE_D" | "MODULE_GHOST";
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
    return lines[0];
  } catch {
    return null;
  }
}

function toPersistedLessonDescription(description: string | null): string | null {
  if (!description) return null;
  const normalized = description.trim();
  if (!normalized) return null;
  return normalized;
}

function isGhostLesson(config: LessonStepConfig): boolean {
  return (
    config.moduleCode === "MODULE_GHOST" ||
    (config as { lessonType?: string }).lessonType === "FULL_HAND_GHOST"
  );
}

const EXPECTED_ACTION_TO_OPTION: Record<string, string[]> = {
  fold: ["canFold"],
  check: ["canCheck"],
  call: ["canCall"],
  raise: ["canBet", "canRaise", "canAllIn"],
  bet: ["canBet"],
  all_in: ["canAllIn"],
};

function snapshotFingerprint(snap: TableSnapshotPayload): string {
  return JSON.stringify({
    street: snap.hand?.street,
    potCents: snap.hand?.potCents,
    board: snap.hand?.board,
    actionCount: snap.hand?.actionCount,
    stateHash: snap.stateHash,
  });
}

async function validateGhostLesson(
  config: LessonStepConfig,
  lessonDir: string,
  readSnapshot: (step: StepConfigStep) => Promise<TableSnapshotPayload | null>,
): Promise<void> {
  if (!isGhostLesson(config)) return;
  const actionSteps = config.steps.filter((s) => s.type === "ACTION_STEP");
  const snapshots: TableSnapshotPayload[] = [];
  for (const step of actionSteps) {
    const snap = await readSnapshot(step);
    if (!snap) throw new Error(`Ghost lesson ${config.lessonId}: step ${step.id} has no snapshot`);
    snapshots.push(snap);
  }

  const lessonHeroSeat = config.heroSeat ?? (snapshots[0] ? snapshots[0].hero?.seat ?? null : null);

  for (let i = 0; i < actionSteps.length; i++) {
    const step = actionSteps[i];
    const snapshot = snapshots[i];
    const expectedAction =
      typeof (step.gradingSpecJson?.expectedAction as string) === "string"
        ? (step.gradingSpecJson.expectedAction as string).trim().toLowerCase()
        : null;
    if (!expectedAction) {
      throw new Error(
        `Ghost lesson ${config.lessonId}: step ${step.id} missing gradingSpecJson.expectedAction`,
      );
    }
    const heroSeat = snapshot.hero?.seat;
    if (typeof heroSeat !== "number") {
      throw new Error(`Ghost lesson ${config.lessonId}: step ${step.id} snapshot missing hero.seat`);
    }
    if (lessonHeroSeat !== null && heroSeat !== lessonHeroSeat) {
      throw new Error(
        `Ghost lesson ${config.lessonId}: step ${step.id} snapshot.hero.seat (${heroSeat}) must match lesson heroSeat (${lessonHeroSeat})`,
      );
    }
    if (config.heroSeat != null && heroSeat !== config.heroSeat) {
      throw new Error(
        `Ghost lesson ${config.lessonId}: step ${step.id} snapshot.hero.seat (${heroSeat}) must equal lesson.heroSeat (${config.heroSeat})`,
      );
    }
    const toActSeat = snapshot.hand?.toActSeat;
    if (typeof toActSeat !== "number" || heroSeat !== toActSeat) {
      throw new Error(
        `Ghost lesson ${config.lessonId}: step ${step.id} snapshot hero.seat (${heroSeat}) must match hand.toActSeat (${toActSeat})`,
      );
    }
    const opts = snapshot.hero?.actionOptions as Record<string, boolean> | undefined;
    const requiredOpts = EXPECTED_ACTION_TO_OPTION[expectedAction];
    if (requiredOpts?.length) {
      const hasOption = requiredOpts.some((key) => opts?.[key] === true);
      if (!hasOption) {
        throw new Error(
          `Ghost lesson ${config.lessonId}: step ${step.id} expectedAction ${expectedAction} not available in hero.actionOptions`,
        );
      }
    }
  }

  for (let i = 0; i < snapshots.length - 1; i++) {
    const a = snapshotFingerprint(snapshots[i]);
    const b = snapshotFingerprint(snapshots[i + 1]);
    if (a === b) {
      throw new Error(
        `Ghost lesson ${config.lessonId}: step ${actionSteps[i + 1].id} snapshot must differ from previous (duplicate snapshot)`,
      );
    }
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
  const contentRoot = path.resolve(root, "content/lessons/content");
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
    const persistedDescription = toPersistedLessonDescription(description);

    await validateGhostLesson(config, lessonDir, async (step) => {
      if (!step.snapshotPath) return null;
      const snapshotPath = path.resolve(lessonDir, step.snapshotPath);
      const raw = await readJson<unknown>(snapshotPath);
      return TableSnapshotPayloadSchema.parse(raw) as TableSnapshotPayload;
    });

    await prisma.lesson.upsert({
      where: { id: lessonId },
      create: {
        id: lessonId,
        slug: `${lessonId.toLowerCase()}-${slugify(config.title)}`,
        title: config.title,
        description: persistedDescription,
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
        replayHandId: config.replayHandId ?? null,
      },
      update: {
        slug: `${lessonId.toLowerCase()}-${slugify(config.title)}`,
        title: config.title,
        description: persistedDescription,
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
        replayHandId: config.replayHandId ?? null,
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
        if (step.type === "ACTION_STEP" && snapshotJson) {
          const expectedAction =
            typeof step.gradingSpecJson?.expectedAction === "string"
              ? step.gradingSpecJson.expectedAction.trim()
              : "";
          if (expectedAction) {
            // Normalize snapshot: validates invariants and derives missing wager bounds / callAmount for all versions.
            snapshotJson = normalizeActionStepSnapshot(snapshotJson, expectedAction, {
              lessonId,
              stepId: step.id,
            });
          }
        }
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

