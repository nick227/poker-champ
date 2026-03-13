/**
 * Regression tests: lesson sheet action buttons must remain clickable (sheet not blocked by table).
 * - Next button click must fire goNext (validates navigation is wired and not blocked).
 * - Sheet container must have pointerEvents="none" so table action bar receives clicks; inner panel has "auto".
 * - Table wrapper must have overflow hidden and minHeight 0 so it does not cover the sheet.
 * Removing any of these fixes from LessonContent.tsx should cause these tests to fail.
 * @vitest-environment happy-dom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LessonContent } from "./LessonContent";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { LessonDefinition, LessonStep } from "./lesson.types";

const listLessonsMock = vi.fn();
vi.mock("./lesson.service", () => ({
  lessonService: {
    getLesson: vi.fn(),
    startOrResumeAttempt: vi.fn(),
    submitStep: vi.fn(),
    getUtilitiesOverview: vi.fn(),
    getNextLessonId: vi.fn(),
    listLessons: () => listLessonsMock(),
  },
}));

const goNextMock = vi.fn();
const goPrevMock = vi.fn();
const sessionMock = {
  loading: false,
  error: null,
  lesson: null as LessonDefinition | null,
  attempt: { id: "a1", lessonId: "l1", status: "IN_PROGRESS" as const, startedAt: "", scorePct: 0 },
  currentStepIndex: 0,
  currentVisibleStepNumber: 1,
  visibleStepCount: 1,
  currentStep: null as LessonStep | null,
  currentFeedback: null,
  currentCommunityComparison: null,
  currentCommunityStatus: "idle" as const,
  submitting: false,
  canGoNext: true,
  canGoPrev: false,
  selectedOptionKey: null,
  lastAwardsGranted: undefined,
  clearLastAwardsGranted: vi.fn(),
  refresh: vi.fn(),
  goNext: goNextMock,
  goPrev: goPrevMock,
  retryCurrentStep: vi.fn(),
  submitAction: vi.fn(),
  submitMcqOption: vi.fn(),
};

vi.mock("./useLessonSession", () => ({
  useLessonSession: () => sessionMock,
}));

vi.mock("@/stores/auth.store", () => ({
  useAuthStore: (sel: (s: { hydrated: boolean }) => unknown) => sel({ hydrated: true }),
}));

vi.mock("@/features/lessons-v2/runtime", () => ({
  isV2ConfiguredStep: () => false,
  useDecisionNodeRuntime: () => ({
    state: "IDLE",
    error: null,
    revealResults: [],
    submit: vi.fn(),
    load: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock("@/features/table", () => ({
  ActiveTableView: () => null,
  ACTION_BAR_HEIGHT: 200,
  mapSeatsToOpponents: () => [],
  buildTableSceneModel: (snapshot: unknown) =>
    snapshot
      ? {
          actionContext: { showActions: false },
          handSummary: null,
          canAct: false,
          heroStatus: "ACTIVE",
          communityCards: [],
          potCents: 0,
          heroCards: [],
          heroStackCents: 0,
          heroActionOptions: null,
          heroCalculations: null,
          heroPlayerStats: undefined,
          heroName: "",
          heroAvatarUrl: undefined,
          isHeroToAct: false,
          isHeroWinner: false,
          isHeroDealer: false,
          tableName: "Test",
          playerCount: 1,
          maxSeats: 6,
          blinds: undefined,
        }
      : null,
}));

vi.mock("@/components/replay/replaySceneModel", () => ({
  buildReplayDisabledSceneModel: (m: unknown) => m,
}));

function minimalSnapshot(): TableSnapshotPayload {
  return {
    snapshotId: "snap1",
    serverTimeTs: Date.now(),
    table: { tableId: "t1", tableName: "Test", maxSeats: 6 },
    seats: [
      {
        seat: 0,
        occupied: true,
        userId: "u1",
        name: "Hero",
        status: "WAITING",
        connected: true,
        stackCents: 10000,
        roundBetCents: 0,
      },
    ],
    hero: {
      seat: 0,
      userId: "u1",
      youAreSeated: true,
      holeCards: [],
    },
    hand: {
      street: "PREFLOP",
      potCents: 0,
      toActSeat: 0,
      dealerSeat: 0,
      board: [],
    },
  } as TableSnapshotPayload;
}

const lessonDef: LessonDefinition = {
  id: "l1",
  slug: "test",
  title: "Test Lesson",
  difficulty: "beginner",
  version: 1,
  steps: [],
};

const infoStep: LessonStep = {
  id: "step_info",
  sequence: 1,
  type: "INFO_STEP",
  snapshot: minimalSnapshot(),
  question: "Info step",
  options: [],
};

describe("LessonContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listLessonsMock.mockResolvedValue({ lessons: [] });
    sessionMock.lesson = { ...lessonDef, steps: [infoStep] };
    sessionMock.currentStep = infoStep;
    sessionMock.canGoPrev = false;
    sessionMock.canGoNext = true;
  });

  it("renders step navigation and Next button is clickable", () => {
    render(
      <LessonContent
        lessonId="l1"
        enabled
        balanceCents={10000}
        onClose={vi.fn()}
        onApplyAtTable={vi.fn()}
        onOpenLesson={vi.fn()}
      />,
    );

    const nextButton = screen.getByRole("button", { name: /next/i });
    fireEvent.click(nextButton);
    expect(goNextMock).toHaveBeenCalledTimes(1);
  });

  it("sheet container has pointerEvents none and zIndex so table action bar can receive clicks", () => {
    render(
      <LessonContent
        lessonId="l1"
        enabled
        balanceCents={10000}
        onClose={vi.fn()}
        onApplyAtTable={vi.fn()}
        onOpenLesson={vi.fn()}
      />,
    );

    const sheet = screen.getByTestId("lesson-sheet");
    expect((sheet as HTMLElement).style.pointerEvents).toBe("none");
    expect((sheet as HTMLElement).style.zIndex).toBe("1");
  });

  it("table wrapper constrains overflow so it does not cover the sheet", () => {
    render(
      <LessonContent
        lessonId="l1"
        enabled
        balanceCents={10000}
        onClose={vi.fn()}
        onApplyAtTable={vi.fn()}
        onOpenLesson={vi.fn()}
      />,
    );

    const tableWrapper = screen.getByTestId("lesson-table-wrapper");
    expect((tableWrapper as HTMLElement).style.overflow).toBe("hidden");
    expect(["0", "0px"]).toContain((tableWrapper as HTMLElement).style.minHeight);
  });
});
