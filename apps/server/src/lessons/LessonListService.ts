import type { PrismaClient } from "@prisma/client";
import { ContentAccessService } from "../api/contentAccess.js";
import { uniqueStrings } from "./utils/objectHelpers.js";
import { computeCurrentStepIndex } from "./attemptHelpers.js";
import type { LessonListResponseDto, LessonListLessonDto } from "./types.js";

type LessonRow = Awaited<
  ReturnType<
    PrismaClient["lesson"]["findMany"]
  >
>[number] & {
  steps: Array<{
    id: string;
    sequence: number;
    type: string;
    concepts: Array<{ concept: { code: string } }>;
  }>;
};

type AttemptRow = Awaited<
  ReturnType<PrismaClient["lessonAttempt"]["findMany"]>
>[number] & {
  steps: Array<{ step: { sequence: number } }>;
};

type DailyChallengeType = "recovery" | "weak_spot" | "fresh_rep" | "repeatable";

function normalizeModuleCode(value: string | null | undefined): LessonListLessonDto["moduleCode"] {
  if (value === "MODULE_A" || value === "A_STOP_BLEEDING_PREFLOP") return "MODULE_A";
  if (value === "MODULE_B" || value === "B_WIN_MORE_FLOPS") return "MODULE_B";
  if (value === "MODULE_C" || value === "C_CLOSE_HAND_PROFITABLY") return "MODULE_C";
  if (value === "MODULE_D") return "MODULE_D";
  if (value === "MODULE_GHOST") return "MODULE_GHOST";
  return "MODULE_A";
}

function buildDailyChallenges(lessons: LessonListLessonDto[]): LessonListResponseDto["dailyChallenges"] {
  const enabled = lessons.filter((lesson) => lesson.hasAccess);
  const selected: LessonListResponseDto["dailyChallenges"] = [];
  const seen = new Set<string>();
  const add = (lesson: LessonListLessonDto | null | undefined, type: DailyChallengeType) => {
    if (!lesson || seen.has(lesson.id) || selected.length >= 3) return;
    selected.push({ lessonId: lesson.id, type });
    seen.add(lesson.id);
  };

  add(enabled.find((lesson) => lesson.progressState === "in_progress"), "recovery");

  add(
    [...enabled]
      .filter((lesson) => lesson.progressState === "completed")
      .sort((a, b) => {
        const aScore = a.bestScorePct ?? a.lastScorePct ?? 50;
        const bScore = b.bestScorePct ?? b.lastScorePct ?? 50;
        if (aScore !== bScore) return aScore - bScore;
        return a.title.localeCompare(b.title);
      })[0] ?? null,
    "weak_spot",
  );

  add(
    [...enabled]
      .filter((lesson) => lesson.progressState === "not_started")
      .sort((a, b) => {
        if (a.moduleCode !== b.moduleCode) return a.moduleCode.localeCompare(b.moduleCode);
        if (a.recommendedOrder !== b.recommendedOrder) return a.recommendedOrder - b.recommendedOrder;
        return a.title.localeCompare(b.title);
      })[0] ?? null,
    "fresh_rep",
  );

  const repeatableFallback = [...enabled]
    .filter((lesson) => lesson.repeatable || lesson.role === "drills")
    .sort((a, b) => {
      if (a.progressState !== b.progressState) {
        if (a.progressState === "in_progress") return -1;
        if (b.progressState === "in_progress") return 1;
      }
      return a.title.localeCompare(b.title);
    });
  for (const lesson of repeatableFallback) {
    add(lesson, "repeatable");
    if (selected.length >= 3) break;
  }

  if (selected.length === 0) {
    for (const lesson of enabled.slice(0, 3)) {
      add(lesson, "fresh_rep");
    }
  }

  return selected;
}

export async function listLessons(
  prisma: PrismaClient,
  userId: string,
): Promise<LessonListResponseDto> {
  const lessons = await prisma.lesson.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ moduleCode: "asc" }, { recommendedOrder: "asc" }, { createdAt: "asc" }],
    include: {
      steps: {
        select: {
          id: true,
          sequence: true,
          type: true,
          concepts: { select: { concept: { select: { code: true } } } },
        },
      },
    },
  });

  const lessonIds = lessons.map((l) => l.id);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [masteryRows, attempts, completedAttemptsLast7Days, accessMap] = await Promise.all([
    prisma.userConceptMastery.findMany({
      where: { userId },
      include: { concept: { select: { code: true, name: true } } },
    }),
    lessonIds.length > 0
      ? prisma.lessonAttempt.findMany({
          where: { userId, lessonId: { in: lessonIds } },
          orderBy: { startedAt: "desc" },
          include: {
            steps: { include: { step: { select: { sequence: true } } } },
          },
        })
      : Promise.resolve([]),
    prisma.lessonAttempt.count({
      where: { userId, status: "COMPLETED", completedAt: { gte: sevenDaysAgo } },
    }),
    lessonIds.length > 0
      ? ContentAccessService.bulkCheckContentAccess(userId, lessonIds, "lesson")
      : Promise.resolve(new Map<string, { hasAccess: boolean }>()),
  ]);

  const masteryByConceptCode = Object.fromEntries(
    masteryRows.map((row) => [
      row.concept.code,
      {
        conceptId: row.conceptId,
        conceptName: row.concept.name,
        masteryScore: row.masteryScore,
        confidence: row.confidence,
        lastUpdatedAt: row.lastUpdatedAt.toISOString(),
      },
    ]),
  );

  const lessonsDto: LessonListLessonDto[] = lessons.map((lesson) =>
    assembleLessonListItem(
      lesson as LessonRow,
      attempts as AttemptRow[],
      accessMap.get(lesson.id)?.hasAccess ?? false,
    ),
  );
  const dailyChallenges = buildDailyChallenges(lessonsDto);

  return {
    cadence: { completedAttemptsLast7Days },
    lessons: lessonsDto,
    dailyChallenges,
    masteryByConceptCode,
  };
}

export interface MasteryResponseDto {
  concepts: Array<{
    conceptId: string;
    code: string;
    name: string;
    masteryScore: number;
    confidence: number;
    lastUpdatedAt: string;
  }>;
}

export async function getMastery(
  prisma: PrismaClient,
  userId: string,
): Promise<MasteryResponseDto> {
  const rows = await prisma.userConceptMastery.findMany({
    where: { userId },
    include: { concept: true },
    orderBy: { lastUpdatedAt: "desc" },
  });
  return {
    concepts: rows.map((row) => ({
      conceptId: row.conceptId,
      code: row.concept.code,
      name: row.concept.name,
      masteryScore: row.masteryScore,
      confidence: row.confidence,
      lastUpdatedAt: row.lastUpdatedAt.toISOString(),
    })),
  };
}

function assembleLessonListItem(
  lesson: LessonRow,
  attempts: AttemptRow[],
  hasAccess: boolean,
): LessonListLessonDto {
  const conceptTags = uniqueStrings(
    lesson.steps.flatMap((s) =>
      (s.concepts ?? []).map((c) => c?.concept?.code ?? ""),
    ),
  );
  const lessonAttempts = attempts.filter((a) => a.lessonId === lesson.id);
  const inProgressAttempt = lessonAttempts.find((a) => a.status === "IN_PROGRESS") ?? null;
  const latestCompleted = lessonAttempts.find((a) => a.status === "COMPLETED") ?? null;
  const latestAttempt = inProgressAttempt ?? latestCompleted ?? lessonAttempts[0] ?? null;
  const orderedSteps = [...lesson.steps].sort((a, b) => a.sequence - b.sequence);
  const progressState = inProgressAttempt
    ? "in_progress"
    : latestCompleted
      ? "completed"
      : "not_started";
  const currentStepIndex = latestAttempt
    ? computeCurrentStepIndex(lesson.steps, latestAttempt.steps)
    : 0;
  const completedForLesson = lessonAttempts.filter((a) => a.status === "COMPLETED");
  const completedScores = completedForLesson
    .map((a) => (typeof a.scorePct === "number" ? a.scorePct : null))
    .filter((s): s is number => s != null);
  const bestScorePct = completedScores.length > 0 ? Math.max(...completedScores) : null;
  const currentStepId = inProgressAttempt
    ? (orderedSteps[computeCurrentStepIndex(orderedSteps, inProgressAttempt.steps)]?.id ?? null)
    : null;

  return {
    id: lesson.id,
    slug: lesson.slug,
    title: lesson.title,
    description: lesson.description,
    difficulty: lesson.difficulty,
    estimatedMinutes: lesson.estimatedMinutes,
    version: lesson.version,
    totalSteps: lesson.steps.length,
    tier: lesson.tier ?? "pro",
    applyCtaText: lesson.applyCtaText,
    progressState,
    inProgressAttemptId: inProgressAttempt?.id ?? null,
    submittedStepCount: latestAttempt?.steps?.length ?? 0,
    completedAttempts: completedForLesson.length,
    currentStepIndex,
    currentStepId,
    lastScorePct: latestAttempt?.scorePct ?? null,
    lastAttemptedAt: latestAttempt?.updatedAt?.toISOString?.() ?? null,
    bestScorePct,
    hasAccess,
    moduleCode: normalizeModuleCode(lesson.moduleCode),
    role: lesson.role as LessonListLessonDto["role"],
    repeatable: lesson.repeatable,
    recommendedOrder: lesson.recommendedOrder,
    conceptTags,
  };
}
