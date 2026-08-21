/** Response DTOs and shared types for lessons API. */

export type LessonState = "not_started" | "in_progress" | "completed";
export type LessonRole = "teaches" | "drills" | "tests";
export type LessonFormat = "STANDARD" | "DRILL";
export type ModuleCode =
  | "MODULE_A"
  | "MODULE_B"
  | "MODULE_C"
  | "MODULE_D"
  | "MODULE_GHOST";

export interface LessonListLessonDto {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  difficulty: string;
  estimatedMinutes: number | null;
  version: number;
  totalSteps: number;
  tier: string | null;
  applyCtaText: string | null;
  progressState: LessonState;
  inProgressAttemptId: string | null;
  submittedStepCount?: number;
  completedAttempts: number;
  currentStepIndex: number;
  currentStepId: string | null;
  lastScorePct: number | null;
  lastAttemptedAt: string | null;
  bestScorePct: number | null;
  hasAccess: boolean;
  moduleCode: ModuleCode;
  role: LessonRole;
  repeatable: boolean;
  recommendedOrder: number;
  conceptTags: string[];
  format: LessonFormat;
}

export interface LessonListResponseDto {
  cadence: { completedAttemptsLast7Days: number };
  lessons: LessonListLessonDto[];
  dailyChallenges: Array<{
    lessonId: string;
    type: "recovery" | "weak_spot" | "fresh_rep" | "repeatable";
  }>;
  masteryByConceptCode: Record<
    string,
    {
      conceptId: string;
      conceptName: string;
      masteryScore: number;
      confidence: number;
      lastUpdatedAt: string;
    }
  >;
}

export interface LessonDetailStepDto {
  id: string;
  sequence: number;
  type: string;
  snapshot: unknown;
  beforeInstructorMessage: string | null;
  question: string | null;
  followUpInstructorMessage: string | null;
  options: Array<{
    optionKey: string;
    label: string;
    value: unknown;
    displayOrder: number;
  }>;
  scenarioProviderKey: string | null;
  evaluatorKey: string | null;
  revealLayerKeys: string[] | null;
  continuationKey: string | null;
  runtimeConfigJson: Record<string, unknown> | null;
  displayCategory: string | null;
  /** ACTION_STEP: pro's action for "Pro played" / ghost comparison */
  expectedAction?: string | null;
  acceptedCorrectActions?: string[] | null;
}

export interface LessonDetailResponseDto {
  lesson: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    difficulty: string;
    estimatedMinutes: number | null;
    version: number;
    tier: string | null;
    applyCtaText: string | null;
    blogPostSlug: string | null;
    replayHandId: string | null;
    steps: LessonDetailStepDto[];
    format: LessonFormat;
    drillConfig: { drillType: string; questionCount: number } | null;
  };
}

export interface GhostAttemptSummary {
  matchedProCount: number;
  totalDecisions: number;
  accuracyPercent: number;
}

export interface StartAttemptResponseDto {
  attempt: {
    id: string;
    lessonId: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    scorePct: number | null;
    summaryJson?: GhostAttemptSummary | null;
    currentStepIndex: number;
    submittedStepCount: number;
    submittedSteps: Array<{
      stepId: string;
      feedback: Record<string, unknown> | null;
      submittedAt: string | null;
    }>;
  };
  resumed: boolean;
}

export interface SubmitFeedbackDto {
  response: string;
  followUpInstructorMessage: string;
  isCorrect: boolean;
  scoreDelta: number;
  evBb?: number;
  takeaway?: string;
  frequencyPerMonth?: number;
  gradeBand?: "STRONG" | "REASONABLE" | "WEAK";
  /** ACTION_STEP: normalized key for "You chose: X" (fold, check, call, raise, all_in) */
  submittedActionKey?: string | null;
}

export interface SubmitResponseDto {
  feedback: SubmitFeedbackDto;
  attempt: {
    id: string;
    lessonId: string;
    status: string;
    scorePct: number | null;
    summaryJson?: GhostAttemptSummary | null;
  };
  awardsGranted?: Array<{ awardId: string; reason: string }>;
  gradingDebug?: { stepType: string; gradingSpec: string };
  idempotentReplay?: boolean;
}

export interface GradeResult {
  isCorrect: boolean;
  response: string;
  followUp: string;
  scoreDelta: number;
  gradeBand?: "STRONG" | "REASONABLE" | "WEAK" | null;
  evBb?: number | null;
  takeaway?: string | null;
  frequencyPerMonth?: number | null;
}

/** Normalized grading spec (one-time parse from JSON, no per-submit walking). */
export interface NormalizedGradingSpec {
  type: string;
  responseCorrect: string;
  responseIncorrect: string;
  followUpContent: string;
  responseReasonable?: string;
  evBb?: number | null;
  evErrorBb?: number | null;
  takeawayIncorrect?: string | null;
  frequencyPerMonth?: number | null;
  gradingMode?: string | null;
  expectedAction?: string;
  expectedOptionKey?: string;
  rubric?: {
    STRONG: string[];
    REASONABLE: string[];
    WEAK: string[];
  } | null;
  response?: string;
}
