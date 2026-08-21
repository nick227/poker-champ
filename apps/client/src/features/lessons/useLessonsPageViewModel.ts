import { useEffect, useMemo, useState } from "react";
import { lessonService } from "@/features/lessons/lesson.service";
import { LESSONS_BUTTON_KEYS, LESSONS_MODULE_META, type LessonsButtonKey } from "./lessons.data";
import { useAuthStore } from "@/stores/auth.store";

export type LessonState = "not_started" | "in_progress" | "completed";
export type LessonRole = "teaches" | "drills" | "tests";
export type Difficulty = "Beginner" | "Core" | "Advanced";
export type ModuleCode = keyof typeof LESSONS_MODULE_META;

export type LessonButtonDescriptor = {
  key: LessonsButtonKey;
  context?: {
    stepNumber?: number;
    lockedLabel?: string | null;
  };
  disabled?: boolean;
  variant?: "primary" | "ghost";
};

export type LessonCatalogItem = {
  id: string;
  title: string;
  outcome: string;
  moduleCode: ModuleCode;
  difficulty: Difficulty;
  estimatedMinutes: number;
  role: LessonRole;
  tags: string[];
  state: LessonState;
  enabled: boolean;
  repeatable: boolean;
  completedAttempts?: number;
  bestScorePct?: number | null;
  currentStepIndex?: number;
  lastAttemptedAt?: string | null;
  lastScorePct?: number | null;
  tier?: string | null;
  applyCtaText?: string | null;
  recommendedOrder: number;
  stateChip: { label: string; cls: string };
  difficultyChipClass: string;
  actionButton: LessonButtonDescriptor;
  format: "STANDARD" | "DRILL";
};

export type CategoryPanel = {
  id: ModuleCode;
  meta: (typeof LESSONS_MODULE_META)[ModuleCode];
  lessons: LessonCatalogItem[];
  done: number;
  total: number;
  pct: number;
};

type RemoteLessonSummary = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  difficulty: string;
  estimatedMinutes?: number | null;
  version: number;
  totalSteps: number;
  progressState?: LessonState;
  inProgressAttemptId?: string | null;
  currentStepIndex?: number;
  lastScorePct?: number | null;
  lastAttemptedAt?: string | null;
  tier?: string | null;
  applyCtaText?: string | null;
  hasAccess?: boolean;
  moduleCode: string;
  role: LessonRole;
  repeatable: boolean;
  completedAttempts?: number;
  bestScorePct?: number | null;
  recommendedOrder: number;
  conceptTags?: string[];
  format?: "STANDARD" | "DRILL";
};

function normalizeDifficulty(value: string): Difficulty {
  const v = value.toLowerCase();
  if (v.includes("advanced")) return "Advanced";
  if (v.includes("core") || v.includes("intermediate")) return "Core";
  return "Beginner";
}

function normalizeModuleCode(value: string | null | undefined): ModuleCode {
  if (value === "MODULE_A" || value === "A_STOP_BLEEDING_PREFLOP") return "MODULE_A";
  if (value === "MODULE_B" || value === "B_WIN_MORE_FLOPS") return "MODULE_B";
  if (value === "MODULE_C" || value === "C_CLOSE_HAND_PROFITABLY") return "MODULE_C";
  if (value === "MODULE_D") return "MODULE_D";
  if (value === "MODULE_GHOST") return "MODULE_GHOST";
  return "MODULE_A";
}

function getStateChip(state: LessonState): { label: string; cls: string } {
  switch (state) {
    case "completed":
      return { label: "Completed", cls: "bg-success/20 text-success" };
    case "in_progress":
      return { label: "In Progress", cls: "bg-brand/20 text-brand" };
    default:
      return { label: "Not Started", cls: "bg-panel text-muted" };
  }
}

function getDifficultyChipClass(difficulty: Difficulty): string {
  switch (difficulty) {
    case "Advanced":
      return "bg-danger/20 text-danger";
    case "Core":
      return "bg-warning/20 text-warning";
    default:
      return "bg-success/20 text-success";
  }
}

function getLessonActionButton(item: {
  enabled: boolean;
  applyCtaText?: string | null;
  state: LessonState;
  currentStepIndex?: number;
}): LessonButtonDescriptor {
  if (!item.enabled) {
    return {
      key: LESSONS_BUTTON_KEYS.LESSON_LOCKED,
      context: { lockedLabel: item.applyCtaText },
      disabled: true,
      variant: "ghost",
    };
  }

  if (item.state === "in_progress") {
    return {
      key: LESSONS_BUTTON_KEYS.LESSON_RESUME_STEP,
      context: { stepNumber: Math.max(1, (item.currentStepIndex ?? 0) + 1) },
      variant: "primary",
    };
  }

  if (item.state === "completed") {
    return {
      key: LESSONS_BUTTON_KEYS.LESSON_REVIEW,
      variant: "ghost",
    };
  }

  return {
    key: LESSONS_BUTTON_KEYS.LESSON_START,
    variant: "ghost",
  };
}

function toCatalogItem(remote: RemoteLessonSummary): LessonCatalogItem {
  const difficulty = normalizeDifficulty(remote.difficulty);
  const state = remote.progressState ?? "not_started";
  return {
    id: remote.id,
    title: remote.title,
    outcome: remote.description ?? "Learn to make higher-EV decisions with practical correction loops.",
    moduleCode: normalizeModuleCode(remote.moduleCode),
    difficulty,
    estimatedMinutes: remote.estimatedMinutes ?? 8,
    role: remote.role,
    tags: remote.conceptTags ?? [],
    state,
    enabled: remote.hasAccess !== false,
    repeatable: remote.repeatable,
    completedAttempts: remote.completedAttempts ?? 0,
    bestScorePct: remote.bestScorePct ?? null,
    currentStepIndex: remote.currentStepIndex ?? 0,
    lastAttemptedAt: remote.lastAttemptedAt ?? null,
    lastScorePct: remote.lastScorePct ?? null,
    tier: remote.tier ?? null,
    applyCtaText: remote.applyCtaText ?? null,
    recommendedOrder: remote.recommendedOrder,
    stateChip: getStateChip(state),
    difficultyChipClass: getDifficultyChipClass(difficulty),
    format: remote.format === "DRILL" ? "DRILL" : "STANDARD",
    actionButton: getLessonActionButton({
      enabled: remote.hasAccess !== false,
      applyCtaText: remote.applyCtaText,
      state,
      currentStepIndex: remote.currentStepIndex,
    }),
  };
}

const CATEGORY_PANEL_ORDER: ModuleCode[] = [
  "DRILLS",
  "MODULE_A",
  "MODULE_B",
  "MODULE_C",
  "MODULE_D",
  "MODULE_GHOST",
];

export function useLessonsPageViewModel() {
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [remoteLessons, setRemoteLessons] = useState<RemoteLessonSummary[]>([]);
  const [cadenceLast7Days, setCadenceLast7Days] = useState<number>(0);

  const authHydrated = useAuthStore((s) => s.hydrated);
  const authToken = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!authHydrated) return;
    if (!authToken) {
      setLoadingCatalog(false);
      setCatalogError("You must be logged in to view lessons.");
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoadingCatalog(true);
      setCatalogError(null);
      try {
        const listRes = await lessonService.listLessons();
        if (cancelled) return;
        setCadenceLast7Days(listRes.cadence?.completedAttemptsLast7Days ?? 0);
        setRemoteLessons(
          (listRes.lessons ?? []).map((item) => ({
            id: item.id,
            slug: item.slug,
            title: item.title,
            description: item.description ?? null,
            difficulty: item.difficulty,
            estimatedMinutes: item.estimatedMinutes ?? null,
            version: item.version,
            totalSteps: item.totalSteps,
            progressState: item.progressState,
            inProgressAttemptId: item.inProgressAttemptId ?? null,
            currentStepIndex: item.currentStepIndex ?? 0,
            lastScorePct: item.lastScorePct ?? null,
            lastAttemptedAt: item.lastAttemptedAt ?? null,
            tier: item.tier ?? null,
            applyCtaText: item.applyCtaText ?? null,
            hasAccess: item.hasAccess ?? false,
            moduleCode: item.moduleCode,
            role: item.role,
            repeatable: item.repeatable,
            completedAttempts: item.completedAttempts ?? 0,
            bestScorePct: item.bestScorePct ?? null,
            recommendedOrder: item.recommendedOrder,
            conceptTags: item.conceptTags ?? [],
            format: item.format,
          })),
        );
      } catch (err) {
        if (cancelled) return;
        setCatalogError(err instanceof Error ? err.message : "Failed to load lessons catalog.");
      } finally {
        if (!cancelled) setLoadingCatalog(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [authHydrated, authToken]);

  const catalog = useMemo(() => {
    return remoteLessons
      .map(toCatalogItem)
      .sort((a, b) => {
        if (a.moduleCode !== b.moduleCode) {
          return a.moduleCode.localeCompare(b.moduleCode);
        }
        if (a.recommendedOrder !== b.recommendedOrder) return a.recommendedOrder - b.recommendedOrder;
        return a.title.localeCompare(b.title);
      });
  }, [remoteLessons]);

  const completedCount = useMemo(() => catalog.filter((item) => item.state === "completed").length, [catalog]);
  const inProgressLesson = useMemo(
    () => catalog.find((item) => item.enabled && item.state === "in_progress") ?? null,
    [catalog],
  );
  const firstLesson = useMemo(() => catalog.find((item) => item.enabled) ?? null, [catalog]);

  const drillLessons = useMemo(
    () =>
      catalog
        .filter((item) => item.enabled && item.format === "DRILL")
        .sort((a, b) => a.recommendedOrder - b.recommendedOrder),
    [catalog],
  );

  const categoryPanels = useMemo<CategoryPanel[]>(() => {
    const grouped: Record<ModuleCode, LessonCatalogItem[]> = {
      DRILLS: drillLessons,
      MODULE_A: [],
      MODULE_B: [],
      MODULE_C: [],
      MODULE_D: [],
      MODULE_GHOST: [],
    };
    for (const item of catalog) {
      if (item.format === "DRILL") continue;
      grouped[item.moduleCode].push(item);
    }
    return CATEGORY_PANEL_ORDER.filter((id) => grouped[id].length > 0).map((id) => {
      const lessons = grouped[id];
      const done = lessons.filter((item) => item.state === "completed").length;
      const pct = lessons.length > 0 ? Math.round((done / lessons.length) * 100) : 0;
      return {
        id,
        meta: LESSONS_MODULE_META[id],
        lessons,
        done,
        total: lessons.length,
        pct,
      };
    });
  }, [catalog, drillLessons]);

  return {
    loadingCatalog,
    catalogError,
    cadenceLast7Days,
    catalogCount: catalog.length,
    completedCount,
    inProgressLesson,
    firstLesson,
    categoryPanels,
    drillLessons,
  };
}
