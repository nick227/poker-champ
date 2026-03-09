/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useLessonSession } from "@/features/lessons/useLessonSession";
import type { LessonDefinition } from "@/features/lessons/lesson.types";

const { getLessonMock, startAttemptMock, submitStepMock, getUtilitiesOverviewMock } = vi.hoisted(() => ({
  getLessonMock: vi.fn(),
  startAttemptMock: vi.fn(),
  submitStepMock: vi.fn(),
  getUtilitiesOverviewMock: vi.fn(),
}));

vi.mock("@/features/lessons/lesson.service", () => ({
  lessonService: {
    getLesson: getLessonMock,
    startOrResumeAttempt: startAttemptMock,
    submitStep: submitStepMock,
    getUtilitiesOverview: getUtilitiesOverviewMock,
  },
}));

const mockLesson: LessonDefinition = {
  id: "lesson_1",
  slug: "mixed-flow",
  title: "Mixed Step Flow",
  difficulty: "beginner",
  version: 1,
  steps: [
    {
      id: "step_action",
      sequence: 1,
      type: "ACTION_STEP",
      snapshot: null,
      question: "Action step question",
      options: [],
    },
    {
      id: "step_mcq",
      sequence: 2,
      type: "MCQ_STEP",
      snapshot: null,
      question: "MCQ step question",
      options: [
        { optionKey: "a", label: "Option A", displayOrder: 1 },
        { optionKey: "b", label: "Option B", displayOrder: 2 },
      ],
    },
    {
      id: "step_info",
      sequence: 3,
      type: "INFO_STEP",
      snapshot: null,
      question: "Info step question",
      options: [],
    },
  ],
};

describe("useLessonSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLessonMock.mockResolvedValue({ lesson: mockLesson });
    startAttemptMock.mockResolvedValue({
      attempt: {
        id: "attempt_1",
        lessonId: "lesson_1",
        status: "IN_PROGRESS",
        startedAt: "2026-02-01T00:00:00.000Z",
        scorePct: 0,
      },
      resumed: false,
    });
    submitStepMock.mockImplementation(async ({ stepId }: { stepId: string }) => ({
      feedback: {
        response: `${stepId}_response`,
        followUpInstructorMessage: `${stepId}_follow_up`,
        isCorrect: true,
        scoreDelta: 1,
      },
      attempt: {
        id: "attempt_1",
        lessonId: "lesson_1",
        status: "IN_PROGRESS",
        scorePct: 50,
      },
    }));
    getUtilitiesOverviewMock.mockResolvedValue({
      communityComparison: {
        lessonId: "lesson_1",
        stepId: "step_mcq",
        sampleSize: 20,
        minimumSampleSize: 100,
        hasSufficientSample: false,
        responseDistribution: { a: 55, b: 45 },
        actionDistribution: {},
        freshnessTimestamp: "2026-03-02T00:00:00.000Z",
        userPercentile: 70,
      },
      benchmarkCheck: {
        lessonId: "lesson_1",
        stepId: "step_mcq",
        scope: "step",
        sampleSize: 2,
        minimumSampleSize: 3,
        hasSufficientSample: false,
        latestScorePct: 100,
        bestScorePct: 100,
        trendDeltaPct: null,
        trend: "insufficient",
        freshnessTimestamp: null,
      },
    });
  });

  it("handles ACTION -> MCQ -> INFO flow and normalizes action payload", async () => {
    const { result } = renderHook(() => useLessonSession("lesson_1", true));

    await waitFor(() => {
      expect(result.current.currentStep?.id).toBe("step_action");
    });

    await act(async () => {
      await result.current.submitAction({ type: "RAISE", amount: 700 });
    });

    expect(submitStepMock).toHaveBeenCalledWith({
      lessonId: "lesson_1",
      attemptId: "attempt_1",
      stepId: "step_action",
      answer: { type: "raise", amountCents: 700 },
    });
    expect(result.current.currentFeedback?.response).toBe("step_action_response");

    act(() => {
      result.current.goNext();
    });
    expect(result.current.currentStep?.id).toBe("step_mcq");

    act(() => {
      void result.current.submitMcqOption("step_mcq", "b");
    });
    expect(result.current.selectedOptionKey).toBe("b");
    await waitFor(() => {
      expect(submitStepMock).toHaveBeenLastCalledWith({
        lessonId: "lesson_1",
        attemptId: "attempt_1",
        stepId: "step_mcq",
        answer: { optionKey: "b" },
      });
    });
    await waitFor(() => {
      expect(result.current.currentFeedback?.response).toBe("step_mcq_response");
    });
    await waitFor(() => {
      expect(getUtilitiesOverviewMock).toHaveBeenCalledWith({
        lessonId: "lesson_1",
        stepId: "step_mcq",
      });
    });
    expect(["loading", "ready"]).toContain(result.current.currentCommunityStatus);

    act(() => {
      result.current.goNext();
    });
    expect(result.current.currentStep?.id).toBe("step_info");
    expect(result.current.currentStep?.type).toBe("INFO_STEP");
  });

  it("resumes existing attempt metadata when service returns resumed attempt", async () => {
    startAttemptMock.mockResolvedValueOnce({
      attempt: {
        id: "attempt_existing",
        lessonId: "lesson_1",
        status: "IN_PROGRESS",
        startedAt: "2026-02-01T00:00:00.000Z",
        scorePct: 66.67,
      },
      resumed: true,
    });

    const { result } = renderHook(() => useLessonSession("lesson_1", true));

    await waitFor(() => {
      expect(result.current.attempt?.id).toBe("attempt_existing");
    });
    expect(result.current.attempt?.scorePct).toBe(66.67);
  });

  it("allows retry to clear feedback and re-submit the same step", async () => {
    submitStepMock.mockImplementation(async ({ answer }: { answer: { optionKey: string } }) => ({
      feedback: {
        response: answer.optionKey === "b" ? "wrong" : "correct",
        followUpInstructorMessage: "follow up",
        isCorrect: answer.optionKey === "a",
        scoreDelta: answer.optionKey === "a" ? 1 : 0,
      },
      attempt: {
        id: "attempt_1",
        lessonId: "lesson_1",
        status: "IN_PROGRESS",
        scorePct: answer.optionKey === "a" ? 100 : 0,
      },
    }));

    const { result } = renderHook(() => useLessonSession("lesson_1", true));

    await waitFor(() => {
      expect(result.current.currentStep?.id).toBe("step_action");
    });

    act(() => {
      result.current.goNext();
    });

    await waitFor(() => {
      expect(result.current.currentStep?.id).toBe("step_mcq");
    });

    await act(async () => {
      await result.current.submitMcqOption("step_mcq", "b");
    });

    await waitFor(() => {
      expect(result.current.currentFeedback?.response).toBe("wrong");
    });

    act(() => {
      result.current.retryCurrentStep();
    });

    expect(result.current.currentFeedback).toBeNull();

    await act(async () => {
      await result.current.submitMcqOption("step_mcq", "a");
    });

    await waitFor(() => {
      expect(result.current.currentFeedback?.response).toBe("correct");
    });
    expect(submitStepMock).toHaveBeenCalledTimes(2);
  });

  it("skips redundant intro INFO step when it duplicates the next ACTION prompt", async () => {
    const introFirstLesson: LessonDefinition = {
      ...mockLesson,
      steps: [
        {
          id: "step_intro",
          sequence: 1,
          type: "INFO_STEP",
          snapshot: null,
          beforeInstructorMessage: "Review the situation before acting.",
          question: "Lesson 15: 22 Chip Leader vs Raise. What is your best action?",
          followUpInstructorMessage: "When ready, make your table decision.",
          options: [],
        },
        {
          id: "step_decision",
          sequence: 2,
          type: "ACTION_STEP",
          snapshot: null,
          question: "Lesson 15: 22 Chip Leader vs Raise. What is your best action?",
          options: [],
        },
      ],
    };

    getLessonMock.mockResolvedValueOnce({ lesson: introFirstLesson });
    startAttemptMock.mockResolvedValueOnce({
      attempt: {
        id: "attempt_intro",
        lessonId: "lesson_1",
        status: "IN_PROGRESS",
        startedAt: "2026-02-01T00:00:00.000Z",
        scorePct: 0,
        currentStepIndex: 0,
      },
      resumed: false,
    });

    const { result } = renderHook(() => useLessonSession("lesson_1", true));

    await waitFor(() => {
      expect(result.current.currentStep?.id).toBe("step_decision");
    });
    expect(result.current.currentStep?.type).toBe("ACTION_STEP");
    expect(result.current.currentVisibleStepNumber).toBe(1);
    expect(result.current.visibleStepCount).toBe(1);
    expect(result.current.canGoPrev).toBe(false);
    expect(result.current.canGoNext).toBe(false);
  });
});
