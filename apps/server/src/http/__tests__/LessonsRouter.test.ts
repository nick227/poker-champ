import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";

const {
  state,
  prismaMock,
} = vi.hoisted(() => {
  type LessonStep = {
    id: string;
    lessonId: string;
    sequence: number;
    type: string;
    questionText: string | null;
    beforeMessage: string | null;
    followUpMessage: string | null;
    gradingSpecJson: Record<string, unknown> | null;
    gradingVersion: number;
    snapshotVersion: number | null;
    snapshotJson: Record<string, unknown> | null;
    options: Array<{
      optionKey: string;
      label: string;
      valueJson: Record<string, unknown> | null;
      displayOrder: number;
    }>;
    concepts: Array<{
      conceptId: string;
      weight: number;
      concept: { code: string; name: string };
    }>;
  };

  const state = {
    lessons: [] as any[],
    steps: [] as LessonStep[],
    attempts: [] as any[],
    attemptSteps: [] as any[],
    mastery: [] as any[],
    lockedLessonIds: new Set<string>(),
  };

  const prismaMock = {
    lesson: {
      findMany: vi.fn(async () =>
        state.lessons
          .filter((l) => l.status === "PUBLISHED")
          .map((l) => ({
            ...l,
            steps: state.steps
              .filter((s) => s.lessonId === l.id)
              .map((s) => ({ id: s.id, sequence: s.sequence, type: s.type })),
          })),
      ),
      findUnique: vi.fn(async ({ where }: any) => {
        const lesson = state.lessons.find((l) => l.id === where.id);
        if (!lesson) return null;
        return {
          ...lesson,
          steps: state.steps
            .filter((s) => s.lessonId === lesson.id)
            .sort((a, b) => a.sequence - b.sequence)
            .map((s) => ({
              ...s,
              options: [...s.options].sort((a, b) => a.displayOrder - b.displayOrder),
            })),
        };
      }),
    },
    userConceptMastery: {
      findMany: vi.fn(async ({ where }: any) =>
        state.mastery
          .filter((m) => m.userId === where.userId)
          .map((m) => ({
            ...m,
            concept: { code: m.code, name: m.name },
          })),
      ),
      findUnique: vi.fn(async ({ where }: any) =>
        state.mastery.find(
          (m) =>
            m.userId === where.userId_conceptId.userId &&
            m.conceptId === where.userId_conceptId.conceptId,
        ) ?? null,
      ),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const idx = state.mastery.findIndex(
          (m) =>
            m.userId === where.userId_conceptId.userId &&
            m.conceptId === where.userId_conceptId.conceptId,
        );
        if (idx === -1) {
          state.mastery.push({
            ...create,
            code: "position",
            name: "Position",
          });
          return create;
        }
        state.mastery[idx] = { ...state.mastery[idx], ...update };
        return state.mastery[idx];
      }),
    },
    lessonAttempt: {
      findUnique: vi.fn(async ({ where }: any) => {
        const row = state.attempts.find((a) => a.id === where?.id);
        return row
          ? {
              id: row.id,
              lessonId: row.lessonId,
              status: row.status,
              scorePct: row.scorePct,
            }
          : null;
      }),
      findFirst: vi.fn(async ({ where, orderBy }: any) => {
        const rows = state.attempts.filter((a) => (
          (where.id == null || a.id === where.id) &&
          (where.lessonId == null || a.lessonId === where.lessonId) &&
          (where.userId == null || a.userId === where.userId) &&
          (where.status == null || a.status === where.status)
        ));
        if (!rows.length) return null;
        if (orderBy?.startedAt === "desc") {
          const row = [...rows].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
          return {
            ...row,
            steps: state.attemptSteps
              .filter((s) => s.attemptId === row.id)
              .map((s) => ({
                ...s,
                step: state.steps.find((st) => st.id === s.stepId) ?? null,
              })),
          };
        }
        const row = rows[0];
        return {
          ...row,
          steps: state.attemptSteps
            .filter((s) => s.attemptId === row.id)
            .map((s) => ({
              ...s,
              step: state.steps.find((st) => st.id === s.stepId) ?? null,
            })),
        };
      }),
      findMany: vi.fn(async ({ where }: any) => {
        const rows = state.attempts.filter((a) => (
          (where.userId == null || a.userId === where.userId) &&
          (where.lessonId == null
            ? true
            : typeof where.lessonId === "string"
              ? a.lessonId === where.lessonId
              : where.lessonId?.in == null || where.lessonId.in.includes(a.lessonId)) &&
          (where.status == null || a.status === where.status)
        ));
        return [...rows]
          .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
          .map((row) => ({
            ...row,
            steps: state.attemptSteps
              .filter((s) => s.attemptId === row.id)
              .map((s) => ({
                ...s,
                step: state.steps.find((st) => st.id === s.stepId) ?? null,
              })),
          }));
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = {
          ...data,
          startedAt: new Date(),
          completedAt: null,
          scorePct: null,
        };
        state.attempts.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const idx = state.attempts.findIndex((a) => a.id === where.id);
        if (idx >= 0) state.attempts[idx] = { ...state.attempts[idx], ...data };
        return state.attempts[idx];
      }),
      count: vi.fn(async ({ where }: any) =>
        state.attempts.filter((a) => (
          (where.userId == null || a.userId === where.userId) &&
          (where.status == null || a.status === where.status) &&
          (where.completedAt?.gte == null || (a.completedAt != null && a.completedAt >= where.completedAt.gte))
        )).length,
      ),
      groupBy: vi.fn(async ({ by, where }: any) => {
        const rows = state.attempts.filter((a) => (
          (where?.userId == null || a.userId === where.userId) &&
          (where?.status == null || a.status === where.status)
        ));
        if (Array.isArray(by) && by.length === 1 && by[0] === "lessonId") {
          const lessonIds = Array.from(new Set(rows.map((a) => a.lessonId)));
          return lessonIds.map((lessonId) => ({ lessonId }));
        }
        return [];
      }),
    },
    userCurriculumProgress: {
      upsert: vi.fn(async ({ where, create, update }: any) => ({
        userId: where?.userId ?? create?.userId ?? "user_test_1",
        completedLessonsCount: update?.completedLessonsCount ?? create?.completedLessonsCount ?? 0,
        updatedAt: update?.updatedAt ?? create?.updatedAt ?? new Date(),
      })),
    },
    lessonStep: {
      findFirst: vi.fn(async ({ where }: any) => {
        const step = state.steps.find((s) =>
          (where.id == null || s.id === where.id) &&
          (where.lessonId == null || s.lessonId === where.lessonId),
        );
        return step ?? null;
      }),
      count: vi.fn(async ({ where }: any) =>
        state.steps.filter((s) => (
          (where.lessonId == null || s.lessonId === where.lessonId) &&
          (where.NOT?.type == null || s.type !== where.NOT.type)
        )).length,
      ),
    },
    lessonAttemptStep: {
      findMany: vi.fn(async ({ where }: any) =>
        state.attemptSteps.filter((s) => {
          if (where.attemptId != null) {
            return s.attemptId === where.attemptId;
          }
          if (where.stepId != null) {
            if (s.stepId !== where.stepId) return false;
            if (where.attempt != null) {
              const attempt = state.attempts.find((a) => a.id === s.attemptId);
              if (!attempt) return false;
              if (where.attempt.userId != null && attempt.userId !== where.attempt.userId) return false;
              if (where.attempt.lessonId != null && attempt.lessonId !== where.attempt.lessonId) return false;
              if (where.attempt.status != null && attempt.status !== where.attempt.status) return false;
            }
            return true;
          }
          if (where.step?.lessonId != null) {
            const step = state.steps.find((st) => st.id === s.stepId);
            return step?.lessonId === where.step.lessonId;
          }
          return true;
        }),
      ),
      count: vi.fn(async ({ where }: any) =>
        state.attemptSteps.filter((s) => {
          if (where.attemptId != null && s.attemptId !== where.attemptId) return false;
          if (typeof where.isCorrect === "boolean" && s.isCorrect !== where.isCorrect) return false;
          if (where.step?.type?.not != null) {
            const step = state.steps.find((st) => st.id === s.stepId);
            if (step?.type === where.step.type.not) return false;
          }
          return true;
        }).length,
      ),
      findUnique: vi.fn(async ({ where }: any) =>
        state.attemptSteps.find(
          (s) => s.attemptId === where.attemptId_stepId.attemptId && s.stepId === where.attemptId_stepId.stepId,
        ) ?? null,
      ),
      create: vi.fn(async ({ data }: any) => {
        const row = {
          ...data,
          submittedAt: new Date(),
        };
        state.attemptSteps.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const idx = state.attemptSteps.findIndex(
          (s) => s.attemptId === where.attemptId_stepId.attemptId && s.stepId === where.attemptId_stepId.stepId,
        );
        if (idx === -1) return null;
        state.attemptSteps[idx] = { ...state.attemptSteps[idx], ...data };
        return state.attemptSteps[idx];
      }),
    },
    $transaction: vi.fn(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => {
      return fn(prismaMock);
    }),
  };

  return { state, prismaMock };
});

vi.mock("@poker-champ/db", () => ({
  getPrisma: () => prismaMock,
}));

vi.mock("../../engine/auth/RequireAuth.js", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user_test_1" };
    next();
  },
}));

vi.mock("../../awards/AwardService.js", () => ({
  awardService: {
    bulkGrant: vi.fn(async () => ({ granted: [] })),
  },
}));

vi.mock("../../api/contentAccess.js", () => ({
  ContentAccessService: {
    checkContentAccess: vi.fn(async ({ contentId }: { contentId: string }) => ({
      hasAccess: !state.lockedLessonIds.has(contentId),
      isPremium: state.lockedLessonIds.has(contentId),
      requiredTier: "pro",
      previewPercentage: 20,
      reason: state.lockedLessonIds.has(contentId) ? "Premium content requires membership" : "Active premium membership",
    })),
    bulkCheckContentAccess: vi.fn(async (_userId: string, contentIds: string[]) => {
      const map = new Map<string, { hasAccess: boolean }>();
      for (const id of contentIds) {
        map.set(id, { hasAccess: !state.lockedLessonIds.has(id) });
      }
      return map;
    }),
  },
}));

import { lessonsRouter } from "../LessonsRouter.js";

const app = express();
app.use(express.json());
app.use("/api/lessons", lessonsRouter);

describe("LessonsRouter", () => {
  let server: http.Server;
  let baseUrl: string;

  async function post(path: string, body?: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
      body: body == null ? undefined : JSON.stringify(body),
    });
  }

  async function get(path: string) {
    return fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: { Authorization: "Bearer test" },
    });
  }

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  beforeEach(() => {
    state.lessons.length = 0;
    state.steps.length = 0;
    state.attempts.length = 0;
    state.attemptSteps.length = 0;
    state.mastery.length = 0;
    state.lockedLessonIds.clear();

    state.lessons.push({
      id: "lesson_test",
      slug: "lesson-test",
      title: "Lesson Test",
      description: "test",
      difficulty: "beginner",
      status: "PUBLISHED",
      estimatedMinutes: 3,
      version: 1,
      moduleCode: "MODULE_A",
      recommendedOrder: 1,
      role: "teaches",
      repeatable: false,
      curriculumVersion: "poker_lessons_full_15_v1",
      tier: "pro",
      applyCtaText: "Apply for Pro",
      createdAt: new Date(),
    });

    state.steps.push({
      id: "step_test",
      lessonId: "lesson_test",
      sequence: 1,
      type: "ACTION_STEP",
      questionText: "What action?",
      beforeMessage: null,
      followUpMessage: "follow",
      gradingVersion: 1,
      snapshotVersion: 1,
      snapshotJson: null,
      gradingSpecJson: {
        type: "ACTION_STEP",
        expectedAction: "RAISE",
        responseCorrect: "Correct",
        responseIncorrect: "Incorrect",
        followUpContent: "Good work on this spot. Review the explanation and analysis.",
      },
      options: [],
      concepts: [{ conceptId: "concept_position", weight: 1, concept: { code: "position", name: "Position" } }],
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("resumes existing in-progress attempt", async () => {
    const first = await post("/api/lessons/lesson_test/attempts");
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    expect(firstBody.attempt.currentStepIndex).toBe(0);
    expect(firstBody.attempt.submittedStepCount).toBe(0);

    const second = await post("/api/lessons/lesson_test/attempts");
    expect(second.status).toBe(200);
    const secondBody = await second.json();

    expect(secondBody.resumed).toBe(true);
    expect(secondBody.attempt.id).toBe(firstBody.attempt.id);
    expect(secondBody.attempt.currentStepIndex).toBe(0);
  });

  it("re-grades re-submissions and does not double-apply mastery", async () => {
    const attemptRes = await post("/api/lessons/lesson_test/attempts");
    const attemptBody = await attemptRes.json();
    const attemptId = attemptBody.attempt.id;

    const submit1 = await post(
      `/api/lessons/lesson_test/attempts/${attemptId}/steps/step_test/submit`,
      { answer: { type: "RAISE", amount: 700 } },
    );
    expect(submit1.status).toBe(200);
    const body1 = await submit1.json();
    expect(body1.feedback.isCorrect).toBe(true);
    expect(body1.attempt.status).toBe("COMPLETED");

    const masteryAfterFirst = state.mastery.find((m) => m.userId === "user_test_1" && m.conceptId === "concept_position");
    expect(masteryAfterFirst).toBeTruthy();
    const scoreAfterFirst = masteryAfterFirst.masteryScore;

    const submit2 = await post(
      `/api/lessons/lesson_test/attempts/${attemptId}/steps/step_test/submit`,
      { answer: { type: "FOLD" } },
    );
    expect(submit2.status).toBe(200);
    const body2 = await submit2.json();
    expect(body2.feedback.isCorrect).toBe(false);
    expect(body2.feedback.response).toBe("Incorrect");
    expect(body2.attempt.status).toBe("COMPLETED");

    const masteryAfterSecond = state.mastery.find((m) => m.userId === "user_test_1" && m.conceptId === "concept_position");
    expect(masteryAfterSecond.masteryScore).toBe(scoreAfterFirst);
    expect(state.attemptSteps.filter((s) => s.attemptId === attemptId && s.stepId === "step_test")).toHaveLength(1);
  });

  it("returns 404 for missing lesson", async () => {
    const res = await get("/api/lessons/missing_lesson");
    expect(res.status).toBe(404);
  });

  it("returns per-lesson progress state in lessons list", async () => {
    const listBefore = await get("/api/lessons");
    expect(listBefore.status).toBe(200);
    const beforeBody = await listBefore.json();
    expect(beforeBody.lessons[0].progressState).toBe("not_started");
    expect(beforeBody.lessons[0].hasAccess).toBe(true);
    expect(beforeBody.lessons[0].tier).toBe("pro");
    expect(beforeBody.lessons[0].applyCtaText).toBe("Apply for Pro");
    expect(beforeBody.lessons[0].moduleCode).toBeTruthy();
    expect(beforeBody.lessons[0].role).toBeTruthy();
    expect(typeof beforeBody.lessons[0].repeatable).toBe("boolean");
    expect(typeof beforeBody.lessons[0].recommendedOrder).toBe("number");
    expect(Array.isArray(beforeBody.lessons[0].conceptTags)).toBe(true);
    expect(typeof beforeBody.cadence?.completedAttemptsLast7Days).toBe("number");
    expect(Array.isArray(beforeBody.dailyChallenges)).toBe(true);
    expect(beforeBody.dailyChallenges[0]?.lessonId).toBe("lesson_test");
    expect(typeof beforeBody.dailyChallenges[0]?.type).toBe("string");

    const attemptRes = await post("/api/lessons/lesson_test/attempts");
    const attemptBody = await attemptRes.json();
    const attemptId = attemptBody.attempt.id;
    await post(`/api/lessons/lesson_test/attempts/${attemptId}/steps/step_test/submit`, {
      answer: { type: "RAISE", amount: 700 },
    });

    const listAfter = await get("/api/lessons");
    expect(listAfter.status).toBe(200);
    const afterBody = await listAfter.json();
    expect(afterBody.lessons[0].progressState).toBe("completed");
    expect(afterBody.lessons[0].completedAttempts).toBe(1);
    expect(afterBody.cadence?.completedAttemptsLast7Days).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(afterBody.dailyChallenges)).toBe(true);
  });

  it("normalizes legacy module codes in lessons list response", async () => {
    state.lessons[0].moduleCode = "A_STOP_BLEEDING_PREFLOP";
    const res = await get("/api/lessons");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lessons[0].moduleCode).toBe("MODULE_A");
  });

  it("returns community comparison utility overview", async () => {
    const attemptRes = await post("/api/lessons/lesson_test/attempts");
    const attemptBody = await attemptRes.json();
    const attemptId = attemptBody.attempt.id;
    await post(`/api/lessons/lesson_test/attempts/${attemptId}/steps/step_test/submit`, {
      answer: { type: "RAISE", amount: 700 },
    });

    const utilRes = await get("/api/lessons/utilities/overview?lessonId=lesson_test");
    expect(utilRes.status).toBe(200);
    const utilBody = await utilRes.json();
    expect(utilBody.communityComparison.lessonId).toBe("lesson_test");
    expect(utilBody.communityComparison.sampleSize).toBe(1);
    expect(utilBody.communityComparison.responseDistribution["act:raise"]).toBe(100);
    expect(utilBody.communityComparison.actionDistribution["act:raise"]).toBe(100);
    expect(utilBody.communityComparison.hasSufficientSample).toBe(false);
    expect(utilBody.benchmarkCheck.lessonId).toBe("lesson_test");
    expect(utilBody.benchmarkCheck.scope).toBe("lesson");
    expect(utilBody.benchmarkCheck.sampleSize).toBe(1);
    expect(utilBody.benchmarkCheck.latestScorePct).toBe(100);
    expect(utilBody.benchmarkCheck.bestScorePct).toBe(100);
  });

  it("supports step-scoped community comparison and rejects mismatched steps", async () => {
    const attemptRes = await post("/api/lessons/lesson_test/attempts");
    const attemptBody = await attemptRes.json();
    const attemptId = attemptBody.attempt.id;
    await post(`/api/lessons/lesson_test/attempts/${attemptId}/steps/step_test/submit`, {
      answer: { type: "RAISE", amount: 700 },
    });

    const scopedRes = await get("/api/lessons/utilities/overview?lessonId=lesson_test&stepId=step_test");
    expect(scopedRes.status).toBe(200);
    const scopedBody = await scopedRes.json();
    expect(scopedBody.communityComparison.lessonId).toBe("lesson_test");
    expect(scopedBody.communityComparison.stepId).toBe("step_test");
    expect(scopedBody.communityComparison.sampleSize).toBe(1);
    expect(scopedBody.communityComparison.responseDistribution["act:raise"]).toBe(100);
    expect(scopedBody.benchmarkCheck.scope).toBe("step");
    expect(scopedBody.benchmarkCheck.sampleSize).toBe(1);
    expect(scopedBody.benchmarkCheck.latestScorePct).toBe(100);

    const missingStepRes = await get("/api/lessons/utilities/overview?lessonId=lesson_test&stepId=step_missing");
    expect(missingStepRes.status).toBe(404);
  });

  it("returns MCQ response distribution and step percentile", async () => {
    state.steps.push({
      id: "step_mcq",
      lessonId: "lesson_test",
      sequence: 2,
      type: "MCQ_STEP",
      questionText: "Best reason?",
      beforeMessage: null,
      followUpMessage: "follow",
      gradingVersion: 1,
      snapshotVersion: 1,
      snapshotJson: null,
      gradingSpecJson: { type: "MCQ_STEP", expectedOptionKey: "a" },
      options: [
        { optionKey: "a", label: "Option A", valueJson: null, displayOrder: 1 },
        { optionKey: "b", label: "Option B", valueJson: null, displayOrder: 2 },
      ],
      concepts: [{ conceptId: "concept_position", weight: 1, concept: { code: "position", name: "Position" } }],
    });

    state.attempts.push(
      {
        id: "attempt_user_1",
        lessonId: "lesson_test",
        userId: "user_test_1",
        status: "COMPLETED",
        startedAt: new Date("2026-03-01T10:00:00.000Z"),
        completedAt: new Date("2026-03-01T10:05:00.000Z"),
        scorePct: 100,
        updatedAt: new Date("2026-03-01T10:05:00.000Z"),
      },
      {
        id: "attempt_user_2",
        lessonId: "lesson_test",
        userId: "user_other_1",
        status: "COMPLETED",
        startedAt: new Date("2026-03-01T11:00:00.000Z"),
        completedAt: new Date("2026-03-01T11:05:00.000Z"),
        scorePct: 0,
        updatedAt: new Date("2026-03-01T11:05:00.000Z"),
      },
    );
    state.attemptSteps.push(
      {
        id: "attempt_step_u1_mcq",
        attemptId: "attempt_user_1",
        stepId: "step_mcq",
        submittedAnswerJson: { optionKey: "a" },
        isCorrect: true,
        feedbackJson: {},
        submittedAt: new Date("2026-03-01T10:02:00.000Z"),
      },
      {
        id: "attempt_step_u2_mcq",
        attemptId: "attempt_user_2",
        stepId: "step_mcq",
        submittedAnswerJson: { optionKey: "b" },
        isCorrect: false,
        feedbackJson: {},
        submittedAt: new Date("2026-03-01T11:02:00.000Z"),
      },
    );

    const scopedRes = await get("/api/lessons/utilities/overview?lessonId=lesson_test&stepId=step_mcq");
    expect(scopedRes.status).toBe(200);
    const scopedBody = await scopedRes.json();
    expect(scopedBody.communityComparison.stepId).toBe("step_mcq");
    expect(scopedBody.communityComparison.sampleSize).toBe(2);
    expect(scopedBody.communityComparison.responseDistribution["mcq:A"]).toBe(50);
    expect(scopedBody.communityComparison.responseDistribution["mcq:B"]).toBe(50);
    expect(Object.keys(scopedBody.communityComparison.actionDistribution)).toHaveLength(0);
    expect(scopedBody.communityComparison.userPercentile).toBe(100);
  });

  it("returns benchmark trend deltas from persisted completed attempts", async () => {
    const attempt1Res = await post("/api/lessons/lesson_test/attempts");
    const attempt1Body = await attempt1Res.json();
    await post(`/api/lessons/lesson_test/attempts/${attempt1Body.attempt.id}/steps/step_test/submit`, {
      answer: { type: "RAISE", amount: 700 },
    });

    const attempt2Res = await post("/api/lessons/lesson_test/attempts");
    const attempt2Body = await attempt2Res.json();
    await post(`/api/lessons/lesson_test/attempts/${attempt2Body.attempt.id}/steps/step_test/submit`, {
      answer: { type: "FOLD" },
    });

    const firstAttempt = state.attempts.find((a) => a.id === attempt1Body.attempt.id);
    const secondAttempt = state.attempts.find((a) => a.id === attempt2Body.attempt.id);
    firstAttempt.updatedAt = new Date("2026-03-01T18:00:00.000Z");
    secondAttempt.updatedAt = new Date("2026-03-01T19:00:00.000Z");

    const utilRes = await get("/api/lessons/utilities/overview?lessonId=lesson_test");
    expect(utilRes.status).toBe(200);
    const utilBody = await utilRes.json();
    expect(utilBody.benchmarkCheck.scope).toBe("lesson");
    expect(utilBody.benchmarkCheck.sampleSize).toBe(2);
    expect(utilBody.benchmarkCheck.latestScorePct).toBe(0);
    expect(utilBody.benchmarkCheck.bestScorePct).toBe(100);
    expect(utilBody.benchmarkCheck.trend).toBe("declining");
    expect(utilBody.benchmarkCheck.trendDeltaPct).toBe(-100);
  });

  it("denies access to locked premium lessons", async () => {
    state.lockedLessonIds.add("lesson_test");

    const detailRes = await get("/api/lessons/lesson_test");
    expect(detailRes.status).toBe(403);
    const detailBody = await detailRes.json();
    expect(detailBody.error).toBe("LESSON_LOCKED");

    const startRes = await post("/api/lessons/lesson_test/attempts");
    expect(startRes.status).toBe(403);
    const startBody = await startRes.json();
    expect(startBody.error).toBe("LESSON_LOCKED");
  });

  it("does not complete attempt when info steps inflate total submissions", async () => {
    state.lessons.push({
      id: "lesson_info_mix",
      slug: "lesson-info-mix",
      title: "Info + Graded Mix",
      description: "test",
      difficulty: "beginner",
      status: "PUBLISHED",
      estimatedMinutes: 5,
      version: 1,
      tier: "pro",
      applyCtaText: "Apply for Pro",
      createdAt: new Date(),
    });

    state.steps.push(
      {
        id: "mix_info_1",
        lessonId: "lesson_info_mix",
        sequence: 1,
        type: "INFO_STEP",
        questionText: null,
        beforeMessage: "info",
        followUpMessage: "continue",
        gradingVersion: 1,
        snapshotVersion: 1,
        snapshotJson: null,
        gradingSpecJson: { type: "INFO_STEP" },
        options: [],
        concepts: [],
      },
      {
        id: "mix_action_1",
        lessonId: "lesson_info_mix",
        sequence: 2,
        type: "ACTION_STEP",
        questionText: "Q1",
        beforeMessage: null,
        followUpMessage: "f1",
        gradingVersion: 1,
        snapshotVersion: 1,
        snapshotJson: null,
        gradingSpecJson: { type: "ACTION_STEP", expectedAction: "RAISE" },
        options: [],
        concepts: [{ conceptId: "concept_position", weight: 1, concept: { code: "position", name: "Position" } }],
      },
      {
        id: "mix_info_2",
        lessonId: "lesson_info_mix",
        sequence: 3,
        type: "INFO_STEP",
        questionText: null,
        beforeMessage: "info2",
        followUpMessage: "continue",
        gradingVersion: 1,
        snapshotVersion: 1,
        snapshotJson: null,
        gradingSpecJson: { type: "INFO_STEP" },
        options: [],
        concepts: [],
      },
      {
        id: "mix_action_2",
        lessonId: "lesson_info_mix",
        sequence: 4,
        type: "ACTION_STEP",
        questionText: "Q2",
        beforeMessage: null,
        followUpMessage: "f2",
        gradingVersion: 1,
        snapshotVersion: 1,
        snapshotJson: null,
        gradingSpecJson: { type: "ACTION_STEP", expectedAction: "RAISE" },
        options: [],
        concepts: [{ conceptId: "concept_position", weight: 1, concept: { code: "position", name: "Position" } }],
      },
      {
        id: "mix_action_3",
        lessonId: "lesson_info_mix",
        sequence: 5,
        type: "ACTION_STEP",
        questionText: "Q3",
        beforeMessage: null,
        followUpMessage: "f3",
        gradingVersion: 1,
        snapshotVersion: 1,
        snapshotJson: null,
        gradingSpecJson: { type: "ACTION_STEP", expectedAction: "RAISE" },
        options: [],
        concepts: [{ conceptId: "concept_position", weight: 1, concept: { code: "position", name: "Position" } }],
      },
    );

    const attemptRes = await post("/api/lessons/lesson_info_mix/attempts");
    expect(attemptRes.status).toBe(201);
    const attemptBody = await attemptRes.json();
    const attemptId = attemptBody.attempt.id;

    const submitInfo1 = await post(
      `/api/lessons/lesson_info_mix/attempts/${attemptId}/steps/mix_info_1/submit`,
      { answer: {} },
    );
    expect(submitInfo1.status).toBe(200);
    let submitBody = await submitInfo1.json();
    expect(submitBody.attempt.status).toBe("IN_PROGRESS");

    const submitAction1 = await post(
      `/api/lessons/lesson_info_mix/attempts/${attemptId}/steps/mix_action_1/submit`,
      { answer: { type: "RAISE", amount: 100 } },
    );
    expect(submitAction1.status).toBe(200);
    submitBody = await submitAction1.json();
    expect(submitBody.attempt.status).toBe("IN_PROGRESS");

    const submitInfo2 = await post(
      `/api/lessons/lesson_info_mix/attempts/${attemptId}/steps/mix_info_2/submit`,
      { answer: {} },
    );
    expect(submitInfo2.status).toBe(200);
    submitBody = await submitInfo2.json();
    expect(submitBody.attempt.status).toBe("IN_PROGRESS");

    const submitAction2 = await post(
      `/api/lessons/lesson_info_mix/attempts/${attemptId}/steps/mix_action_2/submit`,
      { answer: { type: "RAISE", amount: 100 } },
    );
    expect(submitAction2.status).toBe(200);
    submitBody = await submitAction2.json();
    expect(submitBody.attempt.status).toBe("IN_PROGRESS");

    const submitAction3 = await post(
      `/api/lessons/lesson_info_mix/attempts/${attemptId}/steps/mix_action_3/submit`,
      { answer: { type: "RAISE", amount: 100 } },
    );
    expect(submitAction3.status).toBe(200);
    submitBody = await submitAction3.json();
    expect(submitBody.attempt.status).toBe("COMPLETED");
  });
});

