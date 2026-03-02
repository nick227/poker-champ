import { request } from "@poker-champ/sdk";
import type { AwardGrant } from "@/types/awards";
import type {
  LessonAttempt,
  LessonUtilitiesOverview,
  LessonDefinition,
  LessonFeedback,
  LessonMasteryConcept,
} from "./lesson.types";

type LessonsListResponse = {
  cadence?: { completedAttemptsLast7Days: number };
  lessons: Array<{
    id: string;
    slug: string;
    title: string;
    description?: string | null;
    difficulty: string;
    estimatedMinutes?: number | null;
    version: number;
    totalSteps: number;
    progressState?: "not_started" | "in_progress" | "completed";
    inProgressAttemptId?: string | null;
    submittedStepCount?: number;
    completedAttempts?: number;
    currentStepIndex?: number;
    currentStepId?: string | null;
    lastScorePct?: number | null;
    lastAttemptedAt?: string | null;
    bestScorePct?: number | null;
    tier?: string | null;
    applyCtaText?: string | null;
    hasAccess?: boolean;
    moduleCode: "A_STOP_BLEEDING_PREFLOP" | "B_WIN_MORE_FLOPS" | "C_CLOSE_HAND_PROFITABLY";
    role: "teaches" | "drills" | "tests";
    repeatable: boolean;
    recommendedOrder: number;
    conceptTags?: string[];
  }>;
  masteryByConceptCode: Record<string, unknown>;
};

type LessonDetailResponse = {
  lesson: LessonDefinition;
};

type StartAttemptResponse = {
  attempt: LessonAttempt;
  resumed: boolean;
};

type SubmitStepResponse = {
  feedback: LessonFeedback;
  attempt: {
    id: string;
    lessonId: string;
    status: string;
    scorePct: number;
  };
  awardsGranted?: AwardGrant[];
};

type LessonMasteryResponse = {
  concepts: LessonMasteryConcept[];
};

class LessonService {
  listLessons() {
    return request<LessonsListResponse>("GET", "/api/lessons");
  }

  getLesson(lessonId: string) {
    return request<LessonDetailResponse>("GET", `/api/lessons/${encodeURIComponent(lessonId)}`);
  }

  startOrResumeAttempt(lessonId: string) {
    return request<StartAttemptResponse>("POST", `/api/lessons/${encodeURIComponent(lessonId)}/attempts`);
  }

  submitStep(params: {
    lessonId: string;
    attemptId: string;
    stepId: string;
    answer: unknown;
  }) {
    const lessonId = encodeURIComponent(params.lessonId);
    const attemptId = encodeURIComponent(params.attemptId);
    const stepId = encodeURIComponent(params.stepId);
    return request<SubmitStepResponse>(
      "POST",
      `/api/lessons/${lessonId}/attempts/${attemptId}/steps/${stepId}/submit`,
      { answer: params.answer },
    );
  }

  getMastery() {
    return request<LessonMasteryResponse>("GET", "/api/lessons/mastery");
  }

  getUtilitiesOverview(params?: { lessonId?: string; stepId?: string }) {
    const search = new URLSearchParams();
    if (params?.lessonId) search.set("lessonId", params.lessonId);
    if (params?.stepId) search.set("stepId", params.stepId);
    const qs = search.toString();
    return request<LessonUtilitiesOverview>(
      "GET",
      `/api/lessons/utilities/overview${qs ? `?${qs}` : ""}`,
    );
  }
}

export const lessonService = new LessonService();
