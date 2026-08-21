import { request } from "@poker-champ/sdk";
import type { AwardGrant } from "@/types/awards";
import type {
  GhostAttemptSummary,
  LessonAttempt,
  LessonUtilitiesOverview,
  LessonDefinition,
  LessonFeedback,
  LessonMasteryConcept,
} from "./lesson.types";
import type { CompleteDrillSessionResponse, DrillSessionResponse } from "./drills/drill.types";

type LessonsListResponse = {
  cadence?: { completedAttemptsLast7Days: number };
  dailyChallenges?: Array<{
    lessonId: string;
    type: "recovery" | "weak_spot" | "fresh_rep" | "repeatable";
  }>;
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
    moduleCode: "MODULE_A" | "MODULE_B" | "MODULE_C" | "MODULE_D";
    role: "teaches" | "drills" | "tests";
    repeatable: boolean;
    recommendedOrder: number;
    conceptTags?: string[];
    format?: "STANDARD" | "DRILL";
  }>;
  masteryByConceptCode: Record<string, unknown>;
};

type LessonListItem = LessonsListResponse["lessons"][number];

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
    scorePct: number | null;
    summaryJson?: GhostAttemptSummary | null;
  };
  awardsGranted?: AwardGrant[];
};

type LessonMasteryResponse = {
  concepts: LessonMasteryConcept[];
};

class LessonService {
  private static sortLessonsForCurriculum(items: LessonListItem[]): LessonListItem[] {
    return [...items]
      .filter((item) => item.hasAccess !== false)
      .sort((a, b) => {
        const aModule = a.moduleCode;
        const bModule = b.moduleCode;
        if (aModule !== bModule) return aModule.localeCompare(bModule);
        const aOrder = a.recommendedOrder;
        const bOrder = b.recommendedOrder;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.title.localeCompare(b.title);
      });
  }

  listLessons() {
    return request<LessonsListResponse>("GET", "/api/lessons");
  }

  async getNextLessonId(currentLessonId: string): Promise<string | null> {
    const listRes = await this.listLessons();
    const sortedLessons = LessonService.sortLessonsForCurriculum(listRes.lessons ?? []);
    const currentIndex = sortedLessons.findIndex((item) => item.id === currentLessonId);
    if (currentIndex < 0) return null;
    return sortedLessons[currentIndex + 1]?.id ?? null;
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

  startDrillSession(lessonId: string) {
    return request<DrillSessionResponse>(
      "POST",
      `/api/lessons/${encodeURIComponent(lessonId)}/drill-session`,
    );
  }

  completeDrillSession(
    lessonId: string,
    body: { sessionId: string; answers: Array<{ questionId: string; selectedIndex: number }> },
  ) {
    return request<CompleteDrillSessionResponse>(
      "POST",
      `/api/lessons/${encodeURIComponent(lessonId)}/drill-attempts/complete`,
      body,
    );
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
