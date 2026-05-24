/**
 * @vitest-environment happy-dom
 */
import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TournamentResultBanner } from "@/features/table/components/table/TournamentResultBanner";
import {
  BOARD_RESET_FADE_MS,
  DEALING_NEXT_HAND_COPY,
  isTournamentTerminalStripState,
  resolveBetweenHandsTournamentMessage,
  TOURNAMENT_ELIMINATED_COPY,
  TOURNAMENT_FINISHED_COPY,
  WINNER_HOLD_MS,
  useLiveTableStatusStripState,
} from "./useLiveTableStatusStripState";

const tournamentOverlay = {
  tournamentId: "t-freezeout",
  status: "FINISHED" as const,
  currentLevel: 1,
  smallBlindCents: 50,
  bigBlindCents: 100,
  anteCents: 0,
  playFormat: "FREEZEOUT" as const,
};

describe("2-player freezeout end state", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-23T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves winner strip to tournament complete without dealing-next-hand", () => {
    expect(
      resolveBetweenHandsTournamentMessage("FINISHED", { isWinner: true }),
    ).toBe(TOURNAMENT_FINISHED_COPY);
    expect(
      isTournamentTerminalStripState("FINISHED", { isWinner: true }),
    ).toBe(true);
    expect(
      resolveBetweenHandsTournamentMessage("RUNNING", { isWinner: true }),
    ).toBe(TOURNAMENT_FINISHED_COPY);
  });

  it("resolves loser strip to eliminated without dealing-next-hand", () => {
    expect(
      resolveBetweenHandsTournamentMessage("FINISHED", { isEliminated: true }),
    ).toBe(TOURNAMENT_ELIMINATED_COPY);
    expect(
      isTournamentTerminalStripState("FINISHED", { isEliminated: true }),
    ).toBe(true);
    expect(
      resolveBetweenHandsTournamentMessage("RUNNING", { isEliminated: true }),
    ).toBe(TOURNAMENT_ELIMINATED_COPY);
    expect(
      resolveBetweenHandsTournamentMessage("RUNNING", null),
    ).toBe(DEALING_NEXT_HAND_COPY);
  });

  it("transitions winner strip from dealing-next-hand after terminal animations when status arrives late", () => {
    const winnerNoticeDisplay: TableDisplayState = {
      phase: "winnerHold",
      handId: null,
      completedHandId: "hand-final",
      heroUserId: "hero",
      notice: null,
      winnerMessage: "Hero Player wins $10",
      heroPrompt: null,
      passiveMessage: "Waiting for next hand",
      showTurnCue: false,
      boardReset: false,
      connectionLabel: null,
    };

    const { result, rerender } = renderHook(
      (props: {
        displayState: TableDisplayState;
        tournamentStatus: string | null;
        tournamentViewer: { isWinner: boolean } | null;
      }) =>
        useLiveTableStatusStripState({
          tableId: "table-1",
          displayState: props.displayState,
          tournamentStatus: props.tournamentStatus,
          tournamentViewer: props.tournamentViewer,
        }),
      {
        initialProps: {
          displayState: winnerNoticeDisplay,
          tournamentStatus: "RUNNING",
          tournamentViewer: null,
        },
      },
    );

    act(() => {
      vi.advanceTimersByTime(WINNER_HOLD_MS);
    });
    rerender({
      displayState: { ...winnerNoticeDisplay, boardReset: true, phase: "boardReset" },
      tournamentStatus: "RUNNING",
      tournamentViewer: null,
    });

    act(() => {
      vi.advanceTimersByTime(BOARD_RESET_FADE_MS);
    });
    rerender({
      displayState: { ...winnerNoticeDisplay, boardReset: true, phase: "betweenHands" },
      tournamentStatus: "RUNNING",
      tournamentViewer: null,
    });
    expect(result.current.message).toBe(DEALING_NEXT_HAND_COPY);
    expect(result.current.showSpinner).toBe(true);

    rerender({
      displayState: { ...winnerNoticeDisplay, boardReset: true, phase: "betweenHands" },
      tournamentStatus: "FINISHED",
      tournamentViewer: { isWinner: true },
    });
    expect(result.current.message).toBe(TOURNAMENT_FINISHED_COPY);
    expect(result.current.showSpinner).toBe(false);
  });

  it("shows correct result overlays for winner and loser after HU freezeout", () => {
    render(
      <TournamentResultBanner
        tournament={tournamentOverlay}
        tournamentViewer={{
          isEliminated: false,
          isWinner: true,
          finishPlace: 1,
          payoutCents: 2000,
        }}
        onViewStandings={() => {}}
        onBackToLobby={() => {}}
      />,
    );
    expect(screen.getByText("CHAMPION")).toBeTruthy();

    render(
      <TournamentResultBanner
        tournament={tournamentOverlay}
        tournamentViewer={{
          isEliminated: true,
          finishPlace: 2,
          payoutCents: 0,
        }}
        onViewStandings={() => {}}
        onBackToLobby={() => {}}
      />,
    );
    expect(
      screen.getByText("You were eliminated. This is a freezeout — you cannot re-enter."),
    ).toBeTruthy();
  });
});
