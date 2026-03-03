import { nanoid } from "nanoid";
import type { PrismaClient } from "@prisma/client";
import type { AwardGrant } from "../awards/types.js";
import { awardService } from "../awards/AwardService.js";
import { evaluateLessonAwards } from "../awards/evaluateLessonAwards.js";
import { gradeStep, validateActionAnswer } from "./grading/LessonGradingEngine.js";
import { normalizeGradingSpec } from "./grading/normalizeGradingSpec.js";
import { updateMasteryForStep } from "./MasteryService.js";
import { computeCurrentStepIndex, scorePctFromCounts } from "./attemptHelpers.js";
import { asObject } from "./utils/objectHelpers.js";
import type {
  SubmitResponseDto,
  SubmitFeedbackDto,
  StartAttemptResponseDto,
} from "./types.js";

const SUPPORTED_GRADING_VERSION = 1;

type AttemptWithMeta = {
  id: string;
  lessonId: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  scorePct: number | null;
  currentStepIndex?: number;
  submittedStepCount?: number;
  steps?: Array<{ stepId: string; feedbackJson: unknown; submittedAt: Date | null }>;
};

export type StartAttemptResult =
  | { ok: true; body: StartAttemptResponseDto; status: 200 | 201 }
  | { ok: false; error: "LESSON_NOT_FOUND"; status: 404; message: string };

const SUBMIT_ERROR_MESSAGES: Record<string, string> = {
  ATTEMPT_NOT_FOUND: "Attempt not found",
  STEP_NOT_FOUND: "Step not found",
  UNSUPPORTED_GRADING_VERSION: "Unsupported grading version for step",
  INVALID_ANSWER: "Invalid answer payload for this step type",
};

export type SubmitResult =
  | { ok: true; body: SubmitResponseDto }
  | {
      ok: false;
      error: keyof typeof SUBMIT_ERROR_MESSAGES;
      status: 404 | 422 | 400;
      message: string;
    };

export async function startOrResumeAttempt(
  prisma: PrismaClient,
  lessonId: string,
  userId: string,
): Promise<StartAttemptResult> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      status: true,
      steps: { orderBy: { sequence: "asc" }, select: { id: true, sequence: true } },
    },
  });
  if (!lesson || lesson.status !== "PUBLISHED") {
    return { ok: false, error: "LESSON_NOT_FOUND", status: 404, message: "Lesson not found" };
  }

  const existing = await prisma.lessonAttempt.findFirst({
    where: { lessonId, userId, status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
    include: {
      steps: {
        include: { step: { select: { id: true, sequence: true } } },
      },
    },
  });

  if (existing) {
    const currentStepIndex = computeCurrentStepIndex(lesson.steps, existing.steps);
    const body = toAttemptResponseDto(
      { ...existing, currentStepIndex, submittedStepCount: existing.steps.length },
      true,
    );
    return { ok: true, body, status: 200 };
  }

  const created = await prisma.lessonAttempt.create({
    data: {
      id: `attempt_${nanoid(16)}`,
      lessonId,
      userId,
      status: "IN_PROGRESS",
    },
  });
  const body = toAttemptResponseDto(
    { ...created, currentStepIndex: 0, submittedStepCount: 0, steps: [] },
    false,
  );
  return { ok: true, body, status: 201 };
}

function toAttemptResponseDto(
  attempt: AttemptWithMeta,
  resumed: boolean,
): StartAttemptResponseDto {
  const steps = attempt.steps ?? [];
  return {
    attempt: {
      id: attempt.id,
      lessonId: attempt.lessonId,
      status: attempt.status,
      startedAt: attempt.startedAt.toISOString(),
      completedAt: attempt.completedAt?.toISOString() ?? null,
      scorePct: attempt.scorePct,
      currentStepIndex: attempt.currentStepIndex ?? 0,
      submittedStepCount: attempt.submittedStepCount ?? 0,
      submittedSteps: steps.map((s) => ({
        stepId: s.stepId,
        feedback: asObject(s.feedbackJson),
        submittedAt: s.submittedAt?.toISOString() ?? null,
      })),
    },
    resumed,
  };
}

function feedbackFromGrade(grade: ReturnType<typeof gradeStep>): SubmitFeedbackDto {
  const feedback: SubmitFeedbackDto = {
    response: grade.response,
    followUpInstructorMessage: grade.followUp,
    isCorrect: grade.isCorrect,
    scoreDelta: grade.scoreDelta,
  };
  if (grade.evBb != null) feedback.evBb = grade.evBb;
  if (grade.takeaway != null) feedback.takeaway = grade.takeaway;
  if (grade.frequencyPerMonth != null) feedback.frequencyPerMonth = grade.frequencyPerMonth;
  if (grade.gradeBand != null) feedback.gradeBand = grade.gradeBand;
  return feedback;
}

export async function submitStep(
  prisma: PrismaClient,
  params: { lessonId: string; attemptId: string; stepId: string; userId: string; answer: unknown },
): Promise<SubmitResult> {
  const { lessonId, attemptId, stepId, userId, answer } = params;

  const [attempt, step] = await Promise.all([
    prisma.lessonAttempt.findFirst({
      where: { id: attemptId, lessonId, userId },
    }),
    prisma.lessonStep.findFirst({
      where: { id: stepId, lessonId },
      include: {
        options: true,
        concepts: { include: { concept: true } },
      },
    }),
  ]);

  if (!attempt) {
    return { ok: false, error: "ATTEMPT_NOT_FOUND", status: 404, message: SUBMIT_ERROR_MESSAGES.ATTEMPT_NOT_FOUND };
  }
  if (!step) {
    return { ok: false, error: "STEP_NOT_FOUND", status: 404, message: SUBMIT_ERROR_MESSAGES.STEP_NOT_FOUND };
  }
  if ((step.gradingVersion ?? 1) !== SUPPORTED_GRADING_VERSION) {
    return {
      ok: false,
      error: "UNSUPPORTED_GRADING_VERSION",
      status: 422,
      message: SUBMIT_ERROR_MESSAGES.UNSUPPORTED_GRADING_VERSION,
    };
  }
  if (!validateActionAnswer(step.type, answer)) {
    return { ok: false, error: "INVALID_ANSWER", status: 400, message: SUBMIT_ERROR_MESSAGES.INVALID_ANSWER };
  }

  const existingSubmission = await prisma.lessonAttemptStep.findUnique({
    where: { attemptId_stepId: { attemptId, stepId } },
  });

  const spec = normalizeGradingSpec(step.gradingSpecJson, step.followUpMessage);
  const grade = gradeStep(spec, step.type, answer);
  const feedback = feedbackFromGrade(grade);
  const conceptLinks = step.concepts.map((c) => ({
    conceptId: c.conceptId,
    weight: c.concept ? 1 : 1,
  }));

  const result = await prisma.$transaction(async (tx) => {
    if (existingSubmission) {
      await tx.lessonAttemptStep.update({
        where: { attemptId_stepId: { attemptId, stepId } },
        data: {
          submittedAnswerJson: answer as object,
          isCorrect: grade.isCorrect,
          feedbackJson: feedback as object,
          submittedAt: new Date(),
        },
      });
    } else {
      await tx.lessonAttemptStep.create({
        data: {
          id: `attempt_step_${nanoid(16)}`,
          attemptId,
          stepId,
          submittedAnswerJson: answer as object,
          isCorrect: grade.isCorrect,
          feedbackJson: feedback as object,
        },
      });

      await updateMasteryForStep(tx, {
        userId,
        conceptLinks: step.concepts.map((c) => ({ conceptId: c.conceptId, weight: c.weight })),
        isCorrect: grade.isCorrect,
      });
    }

    const [gradedTotal, gradedCorrect] = await Promise.all([
      tx.lessonAttemptStep.count({
        where: {
          attemptId,
          step: { type: { not: "INFO_STEP" } },
        },
      }),
      tx.lessonAttemptStep.count({
        where: {
          attemptId,
          isCorrect: true,
          step: { type: { not: "INFO_STEP" } },
        },
      }),
    ]);

    const requiredTotal = await tx.lessonStep.count({
      where: { lessonId, NOT: { type: "INFO_STEP" } },
    });
    const scorePct = scorePctFromCounts(gradedCorrect, gradedTotal);
    const isComplete = requiredTotal === 0 || gradedTotal >= requiredTotal;

    const updated = await tx.lessonAttempt.update({
      where: { id: attemptId },
      data: {
        scorePct,
        status: isComplete ? "COMPLETED" : attempt.status,
        completedAt: isComplete ? attempt.completedAt ?? new Date() : null,
        masteryDeltaJson: { lastStepId: step.id, updatedAt: new Date().toISOString() },
      },
    });

    let awardsGranted: AwardGrant[] = [];
    if (isComplete) {
      const completedByLesson = await tx.lessonAttempt.groupBy({
        by: ["lessonId"],
        where: { userId, status: "COMPLETED" },
      });
      const completedLessonCount = completedByLesson.length;
      await tx.userCurriculumProgress.upsert({
        where: { userId },
        create: { userId, completedLessonsCount: completedLessonCount, updatedAt: new Date() },
        update: { completedLessonsCount: completedLessonCount, updatedAt: new Date() },
      });
      const incorrectCount = await tx.lessonAttemptStep.count({
        where: { attemptId, isCorrect: false },
      });
      const firstTry = incorrectCount === 0;
      const lessonRow = await tx.lesson.findUnique({
        where: { id: lessonId },
        select: { id: true, title: true },
      });
      if (lessonRow) {
        const candidates = evaluateLessonAwards({
          attempt: { id: updated.id, lessonId: updated.lessonId, scorePct },
          lesson: { id: lessonRow.id, title: lessonRow.title },
          completedLessonCount,
          firstTry,
        });
        const bulk = await awardService.bulkGrant(userId, candidates);
        awardsGranted = bulk.granted;
      }
    }

    return {
      feedback,
      attempt: { id: updated.id, lessonId: updated.lessonId, status: updated.status, scorePct: updated.scorePct },
      awardsGranted,
      gradingDebug: { stepType: step.type, gradingSpec: JSON.stringify(step.gradingSpecJson) },
    };
  });

  return {
    ok: true,
    body: {
      ...result,
      ...(result.awardsGranted.length > 0 && { awardsGranted: result.awardsGranted }),
    },
  };
}
