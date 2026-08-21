import { nanoid } from "nanoid";
import type { PrismaClient } from "@prisma/client";
import type { AwardGrant } from "../../awards/types.js";
import { awardService } from "../../awards/AwardService.js";
import { evaluateLessonAwards } from "../../awards/evaluateLessonAwards.js";
import { scorePctFromCounts } from "../attemptHelpers.js";
import { MATCHUP_EQUITY_SCENARIOS } from "./content/matchupEquityScenarios.js";
import { OUT_COUNTING_SCENARIOS } from "./content/outCountingScenarios.js";
import { generateBetSizingQuestion } from "./generators/betSizing.js";
import { generateRuleOf2And4Question } from "./generators/ruleOf2And4.js";
import { generatePotOddsQuestion } from "./generators/potOdds.js";
import type {
  CompleteDrillAttemptResponseDto,
  DrillCategory,
  DrillLessonConfig,
  DrillQuestion,
  DrillSessionResponseDto,
  SubmitDrillAnswersBodyDto,
} from "./types.js";

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sampleCurated(bank: Array<Omit<DrillQuestion, "id">>, count: number): DrillQuestion[] {
  return shuffle(bank)
    .slice(0, Math.min(count, bank.length))
    .map((entry) => ({ ...entry, id: `dq_${nanoid(12)}` }));
}

function generateQuestions(drillType: DrillCategory, questionCount: number): DrillQuestion[] {
  switch (drillType) {
    case "MATCHUP_EQUITY":
      return sampleCurated(MATCHUP_EQUITY_SCENARIOS, questionCount);
    case "OUT_COUNTING":
      return sampleCurated(OUT_COUNTING_SCENARIOS, questionCount);
    case "BET_SIZING":
      return Array.from({ length: questionCount }, () => generateBetSizingQuestion(`dq_${nanoid(12)}`));
    case "RULE_OF_2_4":
      return Array.from({ length: questionCount }, () => generateRuleOf2And4Question(`dq_${nanoid(12)}`));
    case "POT_ODDS":
      return Array.from({ length: questionCount }, () => generatePotOddsQuestion(`dq_${nanoid(12)}`));
    default:
      return [];
  }
}

export type StartDrillSessionResult =
  | { ok: true; body: DrillSessionResponseDto }
  | { ok: false; error: "LESSON_NOT_FOUND" | "NOT_A_DRILL"; status: 404 | 422; message: string };

export async function startDrillSession(
  prisma: PrismaClient,
  params: { lessonId: string; userId: string },
): Promise<StartDrillSessionResult> {
  const { lessonId, userId } = params;
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, title: true, status: true, format: true, drillConfigJson: true },
  });

  if (!lesson || lesson.status !== "PUBLISHED") {
    return { ok: false, error: "LESSON_NOT_FOUND", status: 404, message: "Lesson not found" };
  }
  if (lesson.format !== "DRILL") {
    return { ok: false, error: "NOT_A_DRILL", status: 422, message: "Lesson is not a drill" };
  }

  const config = lesson.drillConfigJson as DrillLessonConfig | null;
  const drillType = config?.drillType;
  const questionCount = config?.questionCount && config.questionCount > 0 ? config.questionCount : 10;
  if (!drillType) {
    return { ok: false, error: "NOT_A_DRILL", status: 422, message: "Lesson has no drill config" };
  }

  const questions = generateQuestions(drillType, questionCount);

  const session = await prisma.drillSession.create({
    data: {
      id: `drillsession_${nanoid(16)}`,
      lessonId,
      userId,
      questionsJson: questions as unknown as object,
      status: "ACTIVE",
    },
  });

  return {
    ok: true,
    body: {
      sessionId: session.id,
      lessonId,
      title: lesson.title,
      questions,
    },
  };
}

export type CompleteDrillSessionResult =
  | { ok: true; body: CompleteDrillAttemptResponseDto }
  | {
      ok: false;
      error: "SESSION_NOT_FOUND";
      status: 404;
      message: string;
    };

export async function completeDrillSession(
  prisma: PrismaClient,
  params: { lessonId: string; userId: string } & SubmitDrillAnswersBodyDto,
): Promise<CompleteDrillSessionResult> {
  const { lessonId, userId, sessionId, answers } = params;

  const session = await prisma.drillSession.findFirst({
    where: { id: sessionId, lessonId, userId },
  });
  if (!session) {
    return { ok: false, error: "SESSION_NOT_FOUND", status: 404, message: "Drill session not found" };
  }

  if (session.status === "COMPLETED") {
    const existingAttempt = await prisma.lessonAttempt.findFirst({
      where: { lessonId, userId, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
    });
    const questions = session.questionsJson as unknown as DrillQuestion[];
    const summary = (existingAttempt?.summaryJson as { correctCount?: number; totalCount?: number } | null) ?? null;
    return {
      ok: true,
      body: {
        attempt: {
          id: existingAttempt?.id ?? session.id,
          lessonId,
          status: "COMPLETED",
          scorePct: existingAttempt?.scorePct ?? null,
        },
        correctCount: summary?.correctCount ?? 0,
        totalCount: summary?.totalCount ?? questions.length,
      },
    };
  }

  const questions = session.questionsJson as unknown as DrillQuestion[];
  const answerByQuestionId = new Map(answers.map((a) => [a.questionId, a.selectedIndex]));
  const correctCount = questions.reduce((acc, q) => {
    const selected = answerByQuestionId.get(q.id);
    return selected === q.correctIndex ? acc + 1 : acc;
  }, 0);
  const totalCount = questions.length;
  const scorePct = scorePctFromCounts(correctCount, totalCount);

  const result = await prisma.$transaction(async (tx) => {
    await tx.drillSession.update({
      where: { id: session.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    const now = new Date();
    const attempt = await tx.lessonAttempt.create({
      data: {
        id: `attempt_${nanoid(16)}`,
        lessonId,
        userId,
        status: "COMPLETED",
        startedAt: session.createdAt,
        completedAt: now,
        scorePct,
        summaryJson: { correctCount, totalCount } as object,
      },
    });

    const completedByLesson = await tx.lessonAttempt.groupBy({
      by: ["lessonId"],
      where: { userId, status: "COMPLETED" },
    });
    const completedLessonCount = completedByLesson.length;
    await tx.userCurriculumProgress.upsert({
      where: { userId },
      create: { userId, completedLessonsCount: completedLessonCount, updatedAt: now },
      update: { completedLessonsCount: completedLessonCount, updatedAt: now },
    });

    const lessonRow = await tx.lesson.findUnique({ where: { id: lessonId }, select: { id: true, title: true } });
    let awardsGranted: AwardGrant[] = [];
    if (lessonRow) {
      const candidates = evaluateLessonAwards({
        attempt: { id: attempt.id, lessonId: attempt.lessonId, scorePct },
        lesson: { id: lessonRow.id, title: lessonRow.title },
        completedLessonCount,
        firstTry: correctCount === totalCount,
      });
      const bulk = await awardService.bulkGrant(userId, candidates);
      awardsGranted = bulk.granted;
    }

    return { attempt, awardsGranted };
  });

  return {
    ok: true,
    body: {
      attempt: {
        id: result.attempt.id,
        lessonId: result.attempt.lessonId,
        status: result.attempt.status,
        scorePct: result.attempt.scorePct,
      },
      correctCount,
      totalCount,
      ...(result.awardsGranted.length > 0 && {
        awardsGranted: result.awardsGranted.map((a) => ({ awardId: a.awardId, reason: a.reason })),
      }),
    },
  };
}
