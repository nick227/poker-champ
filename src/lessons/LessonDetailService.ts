import type { PrismaClient } from "@prisma/client";
import { getRuntimeConfigFromGradingSpec } from "./utils/runtimeConfig.js";
import { asObject } from "./utils/objectHelpers.js";
import type { LessonDetailResponseDto } from "./types.js";

function getGradingDisplay(gradingSpecJson: unknown): {
  expectedAction: string | null;
  acceptedCorrectActions: string[] | null;
} {
  const spec = asObject(gradingSpecJson);
  if (!spec) return { expectedAction: null, acceptedCorrectActions: null };
  const expectedAction =
    typeof spec.expectedAction === "string" && spec.expectedAction.trim()
      ? spec.expectedAction.trim()
      : null;
  const raw = spec.acceptedCorrectActions;
  const acceptedCorrectActions = Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === "string").map((s) => s.trim().toLowerCase())
    : null;
  return { expectedAction, acceptedCorrectActions };
}

export type GetLessonResult =
  | { ok: true; body: LessonDetailResponseDto }
  | { ok: false; error: "NOT_FOUND"; status: 404; message: string };

export async function getLesson(
  prisma: PrismaClient,
  lessonId: string,
): Promise<GetLessonResult> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      steps: {
        orderBy: { sequence: "asc" },
        include: { options: { orderBy: { displayOrder: "asc" } } },
      },
    },
  });

  if (!lesson || lesson.status !== "PUBLISHED") {
    return { ok: false, error: "NOT_FOUND", status: 404, message: "Lesson not found" };
  }

  const steps = lesson.steps.map((step) => {
    const runtime = getRuntimeConfigFromGradingSpec(step.gradingSpecJson);
    const gradingDisplay = getGradingDisplay(step.gradingSpecJson);
    return {
      ...runtime,
      id: step.id,
      sequence: step.sequence,
      type: step.type,
      snapshot: step.snapshotJson,
      beforeInstructorMessage: step.beforeMessage,
      question: step.questionText,
      followUpInstructorMessage: step.followUpMessage,
      expectedAction: gradingDisplay.expectedAction ?? null,
      acceptedCorrectActions: gradingDisplay.acceptedCorrectActions ?? null,
      options: step.options.map((opt) => ({
        optionKey: opt.optionKey,
        label: opt.label,
        value: opt.valueJson,
        displayOrder: opt.displayOrder,
      })),
    };
  });

  return {
    ok: true,
    body: {
      lesson: {
        id: lesson.id,
        slug: lesson.slug,
        title: lesson.title,
        description: lesson.description,
        difficulty: lesson.difficulty,
        estimatedMinutes: lesson.estimatedMinutes,
        version: lesson.version,
        tier: lesson.tier ?? "pro",
        applyCtaText: lesson.applyCtaText,
        blogPostSlug: lesson.blogPostSlug,
        replayHandId: lesson.replayHandId,
        steps,
      },
    },
  };
}
