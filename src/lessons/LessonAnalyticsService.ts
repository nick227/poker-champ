import type { PrismaClient } from "@prisma/client";
import { getCommunityResponseKey, toLatestIso } from "./utils/objectHelpers.js";

const MINIMUM_SAMPLE_SIZE = 100;
const BENCHMARK_MINIMUM_SAMPLE_SIZE = 3;

export interface UtilitiesOverviewDto {
  communityComparison: {
    lessonId: string;
    stepId: string | null;
    sampleSize: number;
    minimumSampleSize: number;
    hasSufficientSample: boolean;
    responseDistribution: Record<string, number>;
    actionDistribution: Record<string, number>;
    freshnessTimestamp: string | null;
    userPercentile: number | null;
  };
  benchmarkCheck: {
    lessonId: string;
    stepId: string | null;
    scope: "step" | "lesson";
    sampleSize: number;
    minimumSampleSize: number;
    hasSufficientSample: boolean;
    latestScorePct: number | null;
    bestScorePct: number | null;
    trendDeltaPct: number | null;
    trend: "insufficient" | "improving" | "declining" | "stable";
    freshnessTimestamp: string | null;
  };
}

export type GetOverviewResult =
  | { ok: true; body: UtilitiesOverviewDto }
  | { ok: false; error: "NOT_FOUND"; status: 404; message: string };

export async function getUtilitiesOverview(
  prisma: PrismaClient,
  userId: string,
  lessonIdParam: string | null,
  stepIdParam: string | null,
): Promise<GetOverviewResult> {
  const lesson = lessonIdParam
    ? await prisma.lesson.findUnique({
        where: { id: lessonIdParam },
        select: { id: true, status: true },
      })
    : await prisma.lesson.findFirst({
        where: { status: "PUBLISHED" },
        orderBy: { createdAt: "asc" },
        select: { id: true, status: true },
      });

  if (!lesson || lesson.status !== "PUBLISHED") {
    return { ok: false, error: "NOT_FOUND", status: 404, message: "Lesson not found" };
  }

  const lessonId = lesson.id;
  const selectedStep =
    stepIdParam
      ? await prisma.lessonStep.findFirst({
          where: { id: stepIdParam, lessonId },
          select: { id: true },
        })
      : null;

  if (stepIdParam != null && !selectedStep) {
    return { ok: false, error: "NOT_FOUND", status: 404, message: "Step not found for lesson" };
  }

  const stepFilter = selectedStep ? { stepId: selectedStep.id } : { step: { lessonId } };

  const [attemptSteps, completedAttempts] = await Promise.all([
    prisma.lessonAttemptStep.findMany({
      where: stepFilter,
      select: { submittedAt: true, submittedAnswerJson: true },
    }),
    prisma.lessonAttempt.findMany({
      where: { lessonId, status: "COMPLETED" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, userId: true, scorePct: true, updatedAt: true },
    }),
  ]);

  const responseCounts = new Map<string, number>();
  const actionCounts = new Map<string, number>();
  for (const row of attemptSteps) {
    const key = getCommunityResponseKey(row.submittedAnswerJson);
    if (!key) continue;
    responseCounts.set(key, (responseCounts.get(key) ?? 0) + 1);
    if (key.startsWith("act:")) actionCounts.set(key, (actionCounts.get(key) ?? 0) + 1);
  }
  const sampleSize = [...responseCounts.values()].reduce((s, n) => s + n, 0);
  const responseDistribution =
    sampleSize === 0
      ? {}
      : Object.fromEntries(
          [...responseCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([k, count]) => [k, Math.round((count / sampleSize) * 10000) / 100]),
        );
  const actionDistribution =
    actionCounts.size === 0
      ? {}
      : Object.fromEntries(
          [...actionCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([k, count]) => [k, Math.round((count / sampleSize) * 10000) / 100]),
        );

  const freshest = toLatestIso(attemptSteps.map((r) => r.submittedAt));

  const userLatestCompleted = completedAttempts.find(
    (a) => a.userId === userId && a.scorePct != null,
  ) ?? null;
  const scoredAttempts = completedAttempts
    .map((a) => (typeof a.scorePct === "number" ? a.scorePct : null))
    .filter((s): s is number => s != null);
  const basePercentile =
    userLatestCompleted && scoredAttempts.length > 0
      ? (scoredAttempts.filter((s) => s <= Number(userLatestCompleted!.scorePct)).length /
          scoredAttempts.length) *
        10000
      : null;
  let userPercentile: number | null =
    basePercentile != null ? Math.round(basePercentile) / 100 : null;

  if (selectedStep) {
    const completedStepRows = await prisma.lessonAttemptStep.findMany({
      where: {
        stepId: selectedStep.id,
        attempt: { lessonId, status: "COMPLETED" },
      },
      select: { attemptId: true, isCorrect: true },
    });
    const attemptUserById = new Map(completedAttempts.map((a) => [a.id, a.userId]));
    const userStepAgg = new Map<string, { correct: number; total: number }>();
    for (const row of completedStepRows) {
      const uid = attemptUserById.get(row.attemptId);
      if (!uid || typeof row.isCorrect !== "boolean") continue;
      const prev = userStepAgg.get(uid) ?? { correct: 0, total: 0 };
      userStepAgg.set(uid, {
        correct: prev.correct + (row.isCorrect ? 1 : 0),
        total: prev.total + 1,
      });
    }
    const perUserScores = [...userStepAgg.values()]
      .filter((s) => s.total > 0)
      .map((s) => (s.correct / s.total) * 100);
    const currentUserStats = userStepAgg.get(userId);
    if (currentUserStats && currentUserStats.total > 0 && perUserScores.length > 0) {
      const currentScore = (currentUserStats.correct / currentUserStats.total) * 100;
      userPercentile =
        Math.round(
          (perUserScores.filter((s) => s <= currentScore).length / perUserScores.length) * 10000,
        ) / 100;
    } else {
      userPercentile = null;
    }
  }

  const userCompletedAttempts = completedAttempts
    .filter((a) => a.userId === userId && typeof a.scorePct === "number")
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());

  const stepBenchmarkRows = selectedStep
    ? await prisma.lessonAttemptStep.findMany({
        where: {
          stepId: selectedStep.id,
          attempt: { userId, lessonId, status: "COMPLETED" },
        },
        select: { isCorrect: true, submittedAt: true },
        orderBy: { submittedAt: "asc" },
      })
    : [];

  const benchmarkSamples = selectedStep
    ? stepBenchmarkRows.map((r) => (r.isCorrect ? 100 : 0))
    : userCompletedAttempts.map((a) => Number(a.scorePct));
  const benchmarkFreshness = selectedStep
    ? toLatestIso(stepBenchmarkRows.map((r) => r.submittedAt))
    : toLatestIso(userCompletedAttempts.map((a) => a.updatedAt));
  const benchmarkSampleSize = benchmarkSamples.length;
  const benchmarkLatestScore = benchmarkSampleSize > 0 ? benchmarkSamples[benchmarkSampleSize - 1] : null;
  const benchmarkBestScore = benchmarkSampleSize > 0 ? Math.max(...benchmarkSamples) : null;
  const benchmarkPriorAverage =
    benchmarkSampleSize > 1
      ? benchmarkSamples.slice(0, -1).reduce((s, n) => s + n, 0) / (benchmarkSampleSize - 1)
      : null;
  const benchmarkDelta =
    benchmarkLatestScore != null && benchmarkPriorAverage != null
      ? Math.round((benchmarkLatestScore - benchmarkPriorAverage) * 100) / 100
      : null;
  const benchmarkTrend: "insufficient" | "improving" | "declining" | "stable" =
    benchmarkDelta == null
      ? "insufficient"
      : benchmarkDelta >= 1
        ? "improving"
        : benchmarkDelta <= -1
          ? "declining"
          : "stable";

  return {
    ok: true,
    body: {
      communityComparison: {
        lessonId,
        stepId: selectedStep?.id ?? null,
        sampleSize,
        minimumSampleSize: MINIMUM_SAMPLE_SIZE,
        hasSufficientSample: sampleSize >= MINIMUM_SAMPLE_SIZE,
        responseDistribution,
        actionDistribution,
        freshnessTimestamp: freshest,
        userPercentile,
      },
      benchmarkCheck: {
        lessonId,
        stepId: selectedStep?.id ?? null,
        scope: selectedStep ? "step" : "lesson",
        sampleSize: benchmarkSampleSize,
        minimumSampleSize: BENCHMARK_MINIMUM_SAMPLE_SIZE,
        hasSufficientSample: benchmarkSampleSize >= BENCHMARK_MINIMUM_SAMPLE_SIZE,
        latestScorePct: benchmarkLatestScore,
        bestScorePct: benchmarkBestScore,
        trendDeltaPct: benchmarkDelta,
        trend: benchmarkTrend,
        freshnessTimestamp: benchmarkFreshness,
      },
    },
  };
}
