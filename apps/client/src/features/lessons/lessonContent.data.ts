export const LESSON_CONTENT_BUTTON_KEYS = {
  APPLY_AT_TABLE: "APPLY_AT_TABLE",
  BACK_TO_BOOTCAMP: "BACK_TO_BOOTCAMP",
  CONTINUE_ADVANCED_DRILLS: "CONTINUE_ADVANCED_DRILLS",
  MINIMIZE: "MINIMIZE",
  NEXT: "NEXT",
  PREV: "PREV",
  READ_BLOG_POST: "READ_BLOG_POST",
  REPLAY_HAND: "REPLAY_HAND",
  RETRY: "RETRY",
  SHOW_LESSON: "SHOW_LESSON",
} as const;

export type LessonContentButtonKey = (typeof LESSON_CONTENT_BUTTON_KEYS)[keyof typeof LESSON_CONTENT_BUTTON_KEYS];

type ButtonLabelContext = {
  applyCtaText?: string | null;
};

export const LESSON_CONTENT_COPY = {
  completion: {
    badge: "Lesson complete",
    completedSectionHeading: "Completed",
    continueSectionHeading: "Continue",
    bootCampCertified: "Boot Camp Certified",
    scoreHeading: "Score",
    disciplinesHeading: "Disciplines practiced",
    relatedHeading: "Related",
    applySummary: "Apply this at the table. Same interface, same decisions-now with clearer intent.",
  },
  panel: {
    productBadge: "Poker School",
    tierPrefix: "Included in:",
    showLesson: "Show Lesson",
    stepLabel: "Step",
    actionHint: "Answer with the table controls.",
  },
  states: {
    disabled: "Poker School is disabled.",
    loading: "Loading lesson...",
    unavailable: "Lesson unavailable.",
    snapshotUnavailable: "Lesson snapshot unavailable.",
    evaluatingDecision: "Evaluating decision...",
    actionLocked: "Waiting...",
  },
} as const;

const BUTTON_LABEL_RESOLVERS: Record<
  LessonContentButtonKey,
  (context?: ButtonLabelContext) => string
> = {
  APPLY_AT_TABLE: (context) => context?.applyCtaText?.trim() || "Apply at the table",
  BACK_TO_BOOTCAMP: () => "Back to Boot Camp",
  CONTINUE_ADVANCED_DRILLS: () => "Continue with Advanced Drills",
  MINIMIZE: () => "Minimize",
  NEXT: () => "Next",
  PREV: () => "Prev",
  READ_BLOG_POST: () => "Read blog post",
  REPLAY_HAND: () => "Replay hand",
  RETRY: () => "Retry",
  SHOW_LESSON: () => LESSON_CONTENT_COPY.panel.showLesson,
};

export function getLessonButtonLabel(key: LessonContentButtonKey, context?: ButtonLabelContext): string {
  return BUTTON_LABEL_RESOLVERS[key](context);
}
