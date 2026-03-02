import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

export type LessonStepType = "ACTION_STEP" | "MCQ_STEP" | "INFO_STEP";

export type LessonOption = {
  optionKey: string;
  label: string;
  value?: unknown;
  displayOrder: number;
};

export type LessonStep = {
  id: string;
  sequence: number;
  type: LessonStepType;
  snapshot: TableSnapshotPayload | null;
  beforeInstructorMessage?: string | null;
  question?: string | null;
  followUpInstructorMessage?: string | null;
  options: LessonOption[];
  // V2 runtime capability config (optional during migration).
  scenarioProviderKey?: string | null;
  evaluatorKey?: string | null;
  revealLayerKeys?: string[] | null;
  continuationKey?: string | null;
  runtimeConfigJson?: Record<string, unknown> | null;
  // Editorial-only grouping; never used as a runtime branch key.
  displayCategory?: string | null;
};

export type LessonDefinition = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  difficulty: string;
  estimatedMinutes?: number | null;
  version: number;
  tier?: string | null;
  applyCtaText?: string | null;
  blogPostSlug?: string | null;
  replayHandId?: string | null;
  steps: LessonStep[];
};

export type LessonAttempt = {
  id: string;
  lessonId: string;
  status: string;
  startedAt: string;
  completedAt?: string | null;
  scorePct?: number | null;
  currentStepIndex?: number;
  submittedStepCount?: number;
  submittedSteps?: Array<{
    stepId: string;
    feedback?: LessonFeedback | null;
    submittedAt?: string | null;
  }>;
};

export type LessonFeedback = {
  response: string;
  followUpInstructorMessage: string;
  isCorrect: boolean;
  scoreDelta: number;
  gradeBand?: "STRONG" | "REASONABLE" | "WEAK" | null;
  /** EV impact in big blinds (e.g. +1.8 or -2.1). Shown when present. */
  evBb?: number | null;
  /** One-line takeaway for wrong answers. Shown when present and !isCorrect. */
  takeaway?: string | null;
  /** Optional: "You'll see this node ~N times per month" when credible. */
  frequencyPerMonth?: number | null;
};

export type LessonActionPayload = {
  type: "fold" | "check" | "call" | "bet" | "raise" | "all_in";
  amountCents?: number;
};

export type LessonMasteryConcept = {
  conceptId: string;
  code: string;
  name: string;
  masteryScore: number;
  confidence: number;
  lastUpdatedAt: string;
};

export type LessonCommunityComparison = {
  lessonId: string;
  stepId?: string | null;
  sampleSize: number;
  minimumSampleSize: number;
  hasSufficientSample: boolean;
  responseDistribution: Record<string, number>;
  actionDistribution: Record<string, number>;
  freshnessTimestamp: string | null;
  userPercentile: number | null;
};

export type LessonUtilitiesOverview = {
  communityComparison: LessonCommunityComparison;
  benchmarkCheck: {
    lessonId: string;
    stepId?: string | null;
    scope: "lesson" | "step";
    sampleSize: number;
    minimumSampleSize: number;
    hasSufficientSample: boolean;
    latestScorePct: number | null;
    bestScorePct: number | null;
    trendDeltaPct: number | null;
    trend: "improving" | "stable" | "declining" | "insufficient";
    freshnessTimestamp: string | null;
  };
};
