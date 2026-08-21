export const LESSONS_BUTTON_KEYS = {
  HERO_CONTINUE: "HERO_CONTINUE",
  HERO_START_FIRST: "HERO_START_FIRST",
  LESSON_LOCKED: "LESSON_LOCKED",
  LESSON_RESUME_STEP: "LESSON_RESUME_STEP",
  LESSON_REVIEW: "LESSON_REVIEW",
  LESSON_START: "LESSON_START",
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
  module: {
    roleLabel: "role",
    minutesSuffix: "min",
  },
  states: {
    emptyModulesTitle: "No Lessons Loaded",
    emptyModulesBody: "Lessons will appear here after the catalog loads from the server seed.",
    onlineSingle: "1 Online",
    onlineManySuffix: "Online",
    categoryNotFound: "Category not found.",
    backToLessons: "Back to Lessons",
  },
} as const;

export const LESSONS_MODULE_META = {
  DRILLS: {
    title: "Drills",
    promise: "Quick poker math reps.",
  },
  MODULE_A: {
    title: "Facing a Bet",
    promise: "Pot odds and equity when you're the one calling.",
  },
  MODULE_B: {
    title: "Preflop: Premium Hands",
    promise: "Playing big pairs and AK before the flop.",
  },
  MODULE_C: {
    title: "Made Hands Under Pressure",
    promise: "Protecting and valuing hands on dangerous boards.",
  },
  MODULE_D: {
    title: "Pot Odds in Action",
    promise: "Apply pot odds and rule-of-4 math in real hands.",
  },
  MODULE_GHOST: {
    title: "Ghost a Pro",
    promise: "Full hand, decision by decision.",
  },
} as const;

const LESSONS_BUTTON_LABELS: Record<LessonsButtonKey, (context?: LessonsButtonContext) => string> = {
  HERO_CONTINUE: () => "Continue Training",
  HERO_START_FIRST: () => "Start First Lesson",
  LESSON_LOCKED: (context) => context?.lockedLabel?.trim() || "Locked",
  LESSON_RESUME_STEP: (context) => `Resume Step ${context?.stepNumber ?? 1}`,
  LESSON_REVIEW: () => "Try Lesson",
  LESSON_START: () => "Start Lesson",
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

