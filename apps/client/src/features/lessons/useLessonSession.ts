import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActionBarOnAction } from "@/components/domain/table/action-bar";
import { resolveStepRuntimeConfig } from "@/features/lessons-v2/runtime";
import { lessonService } from "./lesson.service";
import type { AwardGrant } from "@/types/awards";
import type {
  LessonActionPayload,
  LessonAttempt,
  LessonCommunityComparison,
  LessonDefinition,
  LessonFeedback,
  LessonStep,
} from "./lesson.types";

type StepFeedbackById = Record<string, LessonFeedback | undefined>;
type CommunityStatus = "idle" | "loading" | "ready";

type AttemptProgressLike = {
  currentStepIndex?: number;
  submittedSteps?: Array<{
    stepId?: string;
    feedback?: LessonFeedback;
  }>;
};

function normalizeStepText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function isSkippableIntroStep(steps: LessonStep[], index: number): boolean {
  const step = steps[index];
  const nextStep = steps[index + 1];
  if (!step || !nextStep) return false;
  if (step.type !== "INFO_STEP" || nextStep.type !== "ACTION_STEP") return false;
  if (step.options.length > 0) return false;

  const stepQuestion = normalizeStepText(step.question);
  const nextQuestion = normalizeStepText(nextStep.question);
  if (!stepQuestion || stepQuestion !== nextQuestion) return false;

  const beforeMessage = normalizeStepText(step.beforeInstructorMessage);
  const followUpMessage = normalizeStepText(step.followUpInstructorMessage);
  return beforeMessage.includes("review") || followUpMessage.includes("when ready");
}

function resolveVisibleStepIndex(steps: LessonStep[], preferredIndex: number): number {
  if (steps.length === 0) return 0;
  const clamped = Math.max(0, Math.min(preferredIndex, steps.length - 1));
  if (!isSkippableIntroStep(steps, clamped)) return clamped;
  for (let idx = clamped + 1; idx < steps.length; idx += 1) {
    if (!isSkippableIntroStep(steps, idx)) return idx;
  }
  for (let idx = clamped - 1; idx >= 0; idx -= 1) {
    if (!isSkippableIntroStep(steps, idx)) return idx;
  }
  return clamped;
}

function findNextVisibleStepIndex(steps: LessonStep[], currentIndex: number): number | null {
  for (let idx = currentIndex + 1; idx < steps.length; idx += 1) {
    if (!isSkippableIntroStep(steps, idx)) return idx;
  }
  return null;
}

function findPreviousVisibleStepIndex(steps: LessonStep[], currentIndex: number): number | null {
  for (let idx = currentIndex - 1; idx >= 0; idx -= 1) {
    if (!isSkippableIntroStep(steps, idx)) return idx;
  }
  return null;
}

function countVisibleSteps(steps: LessonStep[]): number {
  return steps.reduce((count, _step, index) => (isSkippableIntroStep(steps, index) ? count : count + 1), 0);
}

function visibleStepOrdinal(steps: LessonStep[], currentIndex: number): number {
  let ordinal = 0;
  for (let idx = 0; idx <= currentIndex && idx < steps.length; idx += 1) {
    if (!isSkippableIntroStep(steps, idx)) ordinal += 1;
  }
  return ordinal;
}

function toLessonActionPayload(payload: Parameters<ActionBarOnAction>[0]): LessonActionPayload | null {
  switch (payload.type) {
    case "FOLD":
      return { type: "fold" };
    case "CHECK":
      return { type: "check" };
    case "CALL":
      return { type: "call" };
    case "BET":
      return { type: "bet", amountCents: payload.amount };
    case "RAISE":
      return { type: "raise", amountCents: payload.amount };
    case "ALL_IN":
      return { type: "all_in", amountCents: payload.amount };
    default:
      return null;
  }
}

export function useLessonSession(lessonId: string | null, enabled: boolean) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lesson, setLesson] = useState<LessonDefinition | null>(null);
  const [attempt, setAttempt] = useState<LessonAttempt | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [feedbackByStepId, setFeedbackByStepId] = useState<StepFeedbackById>({});
  const [submitting, setSubmitting] = useState(false);
  const [selectedOptionByStepId, setSelectedOptionByStepId] = useState<Record<string, string>>({});
  const [lastAwardsGranted, setLastAwardsGranted] = useState<AwardGrant[]>([]);
  const [communityByStepId, setCommunityByStepId] = useState<Record<string, LessonCommunityComparison | null>>({});
  const [communityStatusByStepId, setCommunityStatusByStepId] = useState<Record<string, CommunityStatus>>({});

  const refresh = useCallback(async () => {
    if (!enabled || !lessonId) return;
    setLoading(true);
    setError(null);
    try {
      const [lessonRes, attemptRes] = await Promise.all([
        lessonService.getLesson(lessonId),
        lessonService.startOrResumeAttempt(lessonId),
      ]);
      setLesson(lessonRes.lesson);
      setAttempt(attemptRes.attempt);
      const progress = attemptRes.attempt as LessonAttempt & AttemptProgressLike;
      const restoredIndex =
        Number.isInteger(progress.currentStepIndex) && Number(progress.currentStepIndex) >= 0
          ? Number(progress.currentStepIndex)
          : 0;
      const restoredFeedback = (progress.submittedSteps ?? []).reduce<StepFeedbackById>((acc, item) => {
        if (item?.stepId && item.feedback) {
          acc[item.stepId] = item.feedback;
        }
        return acc;
      }, {});
      setCurrentStepIndex(resolveVisibleStepIndex(lessonRes.lesson.steps, restoredIndex));
      setFeedbackByStepId(restoredFeedback);
      setSelectedOptionByStepId({});
      setCommunityByStepId({});
      setCommunityStatusByStepId({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lesson");
      setLesson(null);
      setAttempt(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, lessonId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visibleStepCount = useMemo(() => (lesson ? countVisibleSteps(lesson.steps) : 0), [lesson]);
  const resolvedStepIndex = useMemo(() => {
    if (!lesson) return 0;
    return resolveVisibleStepIndex(lesson.steps, currentStepIndex);
  }, [lesson, currentStepIndex]);

  const currentStep = useMemo<LessonStep | null>(() => {
    if (!lesson) return null;
    if (lesson.steps.length === 0) return null;
    const idx = Math.max(0, Math.min(resolvedStepIndex, lesson.steps.length - 1));
    return lesson.steps[idx] ?? null;
  }, [lesson, resolvedStepIndex]);

  const currentVisibleStepNumber = useMemo(() => {
    if (!lesson || lesson.steps.length === 0) return 0;
    return visibleStepOrdinal(lesson.steps, resolvedStepIndex);
  }, [lesson, resolvedStepIndex]);

  const currentFeedback = currentStep ? feedbackByStepId[currentStep.id] ?? null : null;
  const currentCommunityComparison = currentStep ? (communityByStepId[currentStep.id] ?? null) : null;
  const currentCommunityStatus = currentStep ? (communityStatusByStepId[currentStep.id] ?? "idle") : "idle";
  const currentStepRuntimeConfig = useMemo(
    () => (currentStep ? resolveStepRuntimeConfig(currentStep) : null),
    [currentStep],
  );
  const canGoNext = lesson != null && findNextVisibleStepIndex(lesson.steps, resolvedStepIndex) != null;

  const goNext = useCallback(() => {
    setCurrentStepIndex((prev) => {
      if (!lesson) return prev;
      const fromIndex = resolveVisibleStepIndex(lesson.steps, prev);
      const nextIndex = findNextVisibleStepIndex(lesson.steps, fromIndex);
      return nextIndex ?? fromIndex;
    });
  }, [lesson]);

  const goPrev = useCallback(() => {
    setCurrentStepIndex((prev) => {
      if (!lesson) return prev;
      const fromIndex = resolveVisibleStepIndex(lesson.steps, prev);
      const previousIndex = findPreviousVisibleStepIndex(lesson.steps, fromIndex);
      return previousIndex ?? fromIndex;
    });
  }, [lesson]);

  const submitAnswerEvent = useCallback(
    async (answer: unknown) => {
      if (!lessonId || !attempt || !currentStep || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const result = await lessonService.submitStep({
          lessonId,
          attemptId: attempt.id,
          stepId: currentStep.id,
          answer,
        });
        setFeedbackByStepId((prev) => ({
          ...prev,
          [currentStep.id]: result.feedback,
        }));
        setAttempt((prev) =>
          prev
            ? {
                ...prev,
                status: result.attempt.status,
                scorePct: result.attempt.scorePct,
                ...(result.attempt.summaryJson != null && { summaryJson: result.attempt.summaryJson }),
              }
            : prev,
        );
        if (result.awardsGranted?.length) {
          setLastAwardsGranted(result.awardsGranted);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to submit step");
      } finally {
        setSubmitting(false);
      }
    },
    [lessonId, attempt, currentStep, submitting],
  );

  const submitAction = useCallback<ActionBarOnAction>(
    async (payload) => {
      const normalized = toLessonActionPayload(payload);
      if (!normalized) return;
      await submitAnswerEvent(normalized);
    },
    [submitAnswerEvent],
  );

  const submitMcqOption = useCallback(
    async (stepId: string, optionKey: string) => {
      if (!currentStep || currentStep.type !== "MCQ_STEP") return;
      if (currentStep.id !== stepId) return;
      if (feedbackByStepId[stepId] != null || submitting) return;
      setSelectedOptionByStepId((prev) => ({ ...prev, [stepId]: optionKey }));
      await submitAnswerEvent({ optionKey });
    },
    [currentStep, feedbackByStepId, submitting, submitAnswerEvent],
  );

  const retryCurrentStep = useCallback(() => {
    if (!currentStep) return;
    setFeedbackByStepId((prev) => {
      if (!(currentStep.id in prev)) return prev;
      const next = { ...prev };
      delete next[currentStep.id];
      return next;
    });
    setCommunityByStepId((prev) => {
      if (!(currentStep.id in prev)) return prev;
      const next = { ...prev };
      delete next[currentStep.id];
      return next;
    });
    setCommunityStatusByStepId((prev) => {
      if (!(currentStep.id in prev)) return prev;
      const next = { ...prev };
      delete next[currentStep.id];
      return next;
    });
    if (currentStep.type === "MCQ_STEP") {
      setSelectedOptionByStepId((prev) => {
        if (!(currentStep.id in prev)) return prev;
        const next = { ...prev };
        delete next[currentStep.id];
        return next;
      });
    }
  }, [currentStep]);

  const clearLastAwardsGranted = useCallback(() => setLastAwardsGranted([]), []);

  useEffect(() => {
    if (!enabled || !lessonId || !currentStep || !currentFeedback) return;
    const status = communityStatusByStepId[currentStep.id] ?? "idle";
    if (status === "loading" || status === "ready") return;
    let cancelled = false;
    setCommunityStatusByStepId((prev) => ({
      ...prev,
      [currentStep.id]: "loading",
    }));
    lessonService
      .getUtilitiesOverview({ lessonId, stepId: currentStep.id })
      .then((overview) => {
        if (cancelled) return;
        setCommunityByStepId((prev) => ({
          ...prev,
          [currentStep.id]: overview.communityComparison,
        }));
        setCommunityStatusByStepId((prev) => ({
          ...prev,
          [currentStep.id]: "ready",
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setCommunityByStepId((prev) => ({
          ...prev,
          [currentStep.id]: null,
        }));
        setCommunityStatusByStepId((prev) => ({
          ...prev,
          [currentStep.id]: "ready",
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, lessonId, currentStep, currentFeedback, communityStatusByStepId]);

  return {
    loading,
    error,
    lesson,
    attempt,
    currentStepIndex: resolvedStepIndex,
    currentVisibleStepNumber,
    visibleStepCount,
    currentStep,
    currentStepRuntimeConfig,
    currentFeedback,
    currentCommunityComparison,
    currentCommunityStatus,
    submitting,
    canGoNext,
    canGoPrev: lesson != null && findPreviousVisibleStepIndex(lesson.steps, resolvedStepIndex) != null,
    selectedOptionKey: currentStep ? selectedOptionByStepId[currentStep.id] ?? null : null,
    lastAwardsGranted,
    clearLastAwardsGranted,
    refresh,
    goNext,
    goPrev,
    retryCurrentStep,
    submitAction,
    submitMcqOption,
  };
}
