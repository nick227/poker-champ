export const LESSONS_BUTTON_KEYS = {
  HERO_CONTINUE: "HERO_CONTINUE",
  HERO_START_FIRST: "HERO_START_FIRST",
  LESSON_LOCKED: "LESSON_LOCKED",
  LESSON_RESUME_STEP: "LESSON_RESUME_STEP",
  LESSON_REVIEW: "LESSON_REVIEW",
  LESSON_START: "LESSON_START",
  CHALLENGE_RESUME: "CHALLENGE_RESUME",
  CHALLENGE_START: "CHALLENGE_START",
} as const;

export type LessonsButtonKey = (typeof LESSONS_BUTTON_KEYS)[keyof typeof LESSONS_BUTTON_KEYS];

type LessonsButtonContext = {
  stepNumber?: number;
  lockedLabel?: string | null;
};

export const LESSONS_PAGE_COPY = {
  hero: {
    badge: "Poker School",
    title: "Build those poker skills",
    progressHeading: "Progress",
    progressSuffix: "lessons completed",
    trainedPrefix: "Trained",
    trainedSuffix: "in the last 7 days.",
  },
  sections: {
    continue: {
      title: "Continue",
      cardHeading: "Continue where you left off",
      stepSuffix: "in progress",
    },
    recentCompleted: {
      title: "Recently Completed",
      fallbackDateLabel: "Recently completed",
      completedPrefix: "Completed",
    },
    dailyChallenges: {
      title: "Daily Challenges",
      subtitle: "Fluid reps selected from your curriculum for today.",
      availableSuffix: "today",
      attemptsPrefix: "Attempts",
      bestPrefix: "Best",
      typeLabels: {
        recovery: "Recovery",
        weak_spot: "Weak Spot",
        fresh_rep: "Fresh Rep",
        repeatable: "Repeatable",
      },
    },
  },
  module: {
    roleLabel: "role",
    minutesSuffix: "min",
  },
  states: {
    emptyModulesTitle: "No Lessons Loaded",
    emptyModulesBody: "Lessons will appear here after the catalog loads from the server seed.",
    refreshingCatalog: "Refreshing lesson catalog...",
    onlineSingle: "1 Online",
    onlineManySuffix: "Online",
  },
} as const;

export const LESSONS_MODULE_META = {
  MODULE_A: {
    title: "Module A",
    promise: "Try out these common spots.",
  },
  MODULE_B: {
    title: "Module B",
    promise: "Work on your post-flop play.",
  },
  MODULE_C: {
    title: "Module C",
    promise: "Improving your win-rate.",
  },
  MODULE_D: {
    title: "Quick Checks",
    promise: "Pot odds and poker math.",
  },
} as const;

const LESSONS_BUTTON_LABELS: Record<LessonsButtonKey, (context?: LessonsButtonContext) => string> = {
  HERO_CONTINUE: () => "Continue Training",
  HERO_START_FIRST: () => "Start First Lesson",
  LESSON_LOCKED: (context) => context?.lockedLabel?.trim() || "Locked",
  LESSON_RESUME_STEP: (context) => `Resume Step ${context?.stepNumber ?? 1}`,
  LESSON_REVIEW: () => "Try Lesson",
  LESSON_START: () => "Start Lesson",
  CHALLENGE_RESUME: () => "Resume Challenge",
  CHALLENGE_START: () => "Start Challenge",
};

export function getLessonsButtonLabel(key: LessonsButtonKey, context?: LessonsButtonContext): string {
  return LESSONS_BUTTON_LABELS[key](context);
}

export function formatLessonsProgress(completed: number, total: number): string {
  return `${completed}/${total} ${LESSONS_PAGE_COPY.hero.progressSuffix}`;
}

export function formatLessonsCadence(count: number): string {
  return `${LESSONS_PAGE_COPY.hero.trainedPrefix} ${count} time${count !== 1 ? "s" : ""} ${LESSONS_PAGE_COPY.hero.trainedSuffix}`;
}

export function formatLessonsScore(scorePct: number | null | undefined): string {
  return scorePct != null ? `${scorePct}%` : "Completed";
}

export function formatLessonsCompletedDate(value: string | null | undefined): string {
  if (!value) return LESSONS_PAGE_COPY.sections.recentCompleted.fallbackDateLabel;
  return `${LESSONS_PAGE_COPY.sections.recentCompleted.completedPrefix} ${new Date(value).toLocaleDateString()}`;
}
