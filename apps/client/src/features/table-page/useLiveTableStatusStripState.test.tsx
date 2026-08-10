// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HeroActionOptions,
  TableSnapshotPayload,
} from "@poker-champ/realtime-contract";
import { formatCents } from "@/lib/format";
import type {
  ActionNotice,
  ConnectionStatus,
  HandResultMessage,
} from "@/features/table/display";
import {
  ALL_IN_COPY,
  deriveTableViewState,
  YOUR_MOVE_COPY,
} from "@/features/table/display";
import type { PendingAction } from "@/features/table/stores/multitable.store";
import {
  BOARD_RESET_FADE_MS,
  DEALING_NEXT_HAND_COPY,
  MIN_MESSAGE_DURATION_MS,
  REBUY_TO_CONTINUE_COPY,
  TERMINAL_TIMEOUT_MS,
  TOURNAMENT_ELIMINATED_COPY,
  TOURNAMENT_REBUY_AVAILABLE_COPY,
  resolveBetweenHandsTournamentMessage,
  mergeTournamentViewer,
  TOURNAMENT_FINISHED_COPY,
  WINNER_HOLD_MS,
  useLiveTableStatusStripState,
} from "./useLiveTableStatusStripState";
import {
  deriveTableDisplayState,
  DISCONNECTED_COPY,
  RECONNECTING_COPY,
} from "./tableDisplayState";
import type { TableDisplayState } from "./tableDisplayState";

type HookProps = {
  tableId: string;
  displayState: TableDisplayState;
  tournamentStatus?: string | null;
  tournamentViewer?: { isEliminated?: boolean; isWinner?: boolean } | null;
  debugNowTs?: number;
};
type ScenarioOverrides = {
  tableId?: string;
  connectionStatus?: ConnectionStatus;
  snapshot?: TableSnapshotPayload | null;
  actionNotice?: ActionNotice | null;
  handResultNotice?: HandResultMessage | null;
  heroActionOptions?: HeroActionOptions | null;
  isHeroTurn?: boolean;
  actionsInteractive?: boolean;
  pendingAction?: PendingAction;
  sceneMode?: "idle" | "active";
  debugNowTs?: number;
  tournamentStatus?: string | null;
  tournamentViewer?: { isEliminated?: boolean; isWinner?: boolean } | null;
};

function makeSnapshot({
  handId = "hand-1",
  board = [] as string[],
  potCents = 400,
  heroActionOptions,
}: {
  handId?: string | null;
  board?: string[];
  potCents?: number;
  heroActionOptions?: HeroActionOptions;
} = {}): TableSnapshotPayload {
  return {
    version: 1,
    snapshotId: `snap-${handId ?? "idle"}`,
    snapshotSeq: 1,
    emittedAtTs: Date.now(),
    serverTimeTs: Date.now(),
    stateHash: "state-hash",
    reason: "ACTION_ACCEPTED",
    table: {
      tableId: "table-1",
      tableName: "Premium Table",
      visibility: "PUBLIC",
      maxSeats: 6,
      smallBlindCents: 50,
      bigBlindCents: 100,
      minBuyInCents: 1000,
      maxBuyInCents: 10000,
      showStats: true,
    },
    seats: [
      {
        seat: 0,
        occupied: true,
        userId: "hero",
        name: "Hero Player",
        stackCents: 2000,
        roundBetCents: 0,
        committedCents: 0,
        connected: true,
        disconnectDeadlineTs: 0,
        isDealer: false,
        status: "ACTIVE",
        isToAct: handId != null,
        isBot: false,
      },
      {
        seat: 1,
        occupied: true,
        userId: "villain",
        name: "Callie Doyle",
        stackCents: 2000,
        roundBetCents: 0,
        committedCents: 0,
        connected: true,
        disconnectDeadlineTs: 0,
        isDealer: true,
        status: "ACTIVE",
        isToAct: false,
        isBot: false,
      },
    ],
    hero: {
      userId: "hero",
      youAreSeated: true,
      seat: 0,
      actionOptions: heroActionOptions,
    },
    hand:
      handId == null
        ? undefined
        : {
            handId,
            handNumber: 1,
            street: "PREFLOP",
            dealerSeat: 1,
            sbSeat: 0,
            bbSeat: 1,
            toActSeat: 0,
            actionCount: 0,
            roundCurrentBetCents: 100,
            minRaiseCents: 100,
            potCents,
            board,
          },
  };
}

function makeHeroActionOptions(
  overrides: Partial<HeroActionOptions> = {},
): HeroActionOptions {
  return {
    canFold: true,
    canCheck: false,
    canCall: true,
    canBet: false,
    canRaise: true,
    canAllIn: true,
    primaryWagerAction: "RAISE",
    callAmount: 100,
    minRaiseTo: 300,
    maxRaiseTo: 2000,
    ...overrides,
  };
}

function makeActionNotice(
  overrides: Partial<ActionNotice> & Pick<ActionNotice, "key" | "handId" | "message">,
): ActionNotice {
  return {
    actorUserId: overrides.actorUserId,
    ...overrides,
  };
}

function makeHandResultNotice(
  handId: string,
  overrides: Partial<HandResultMessage> = {},
): HandResultMessage {
  return {
    handId,
    winnerName: "Hero Player",
    amountCents: 400,
    ...overrides,
  };
}

function makePendingAction(createdAtTs: number): PendingAction {
  return {
    actionId: "pending-1",
    payload: {
      actionId: "pending-1",
      action: "CALL",
    } as PendingAction["payload"],
    retriesLeft: 3,
    createdAtTs,
    dispatchHandStreet: null,
  };
}

function applyScenarioOverrides(
  snapshot: TableSnapshotPayload | null,
  overrides: ScenarioOverrides,
): TableSnapshotPayload | null {
  if (!snapshot) {
    return snapshot;
  }
  const tableId = overrides.tableId ?? snapshot.table.tableId;
  const heroActionOptions =
    overrides.heroActionOptions === undefined
      ? snapshot.hero.actionOptions
      : overrides.heroActionOptions ?? undefined;
  const isHeroTurn =
    overrides.isHeroTurn === undefined
      ? false
      : overrides.isHeroTurn;

  const seats = snapshot.seats.map((seat) => {
    if (snapshot.hero.seat == null) {
      return seat;
    }
    if (seat.seat === snapshot.hero.seat) {
      return { ...seat, isToAct: Boolean(isHeroTurn) };
    }
    if (snapshot.hand?.toActSeat != null && seat.seat === snapshot.hand.toActSeat) {
      return { ...seat, isToAct: false };
    }
    return seat;
  });

  return {
    ...snapshot,
    table: {
      ...snapshot.table,
      tableId,
    },
    seats,
    hero: {
      ...snapshot.hero,
      actionOptions: heroActionOptions,
    },
    hand: snapshot.hand
      ? {
          ...snapshot.hand,
          toActSeat: isHeroTurn
            ? snapshot.hero.seat ?? snapshot.hand.toActSeat
            : snapshot.seats.find((seat) => seat.seat !== snapshot.hero.seat)?.seat ?? snapshot.hand.toActSeat,
        }
      : undefined,
  };
}

function makeProps(overrides: ScenarioOverrides = {}): HookProps {
  const snapshot = applyScenarioOverrides(
    overrides.snapshot === undefined ? makeSnapshot() : overrides.snapshot,
    overrides,
  );
  const connectionStatus = overrides.connectionStatus ?? "CONNECTED";
  const viewState = snapshot != null
    ? deriveTableViewState(snapshot, connectionStatus)
    : null;
  const emptyDisplayState: TableDisplayState = {
    phase: "betweenHands",
    handId: null,
    completedHandId: null,
    heroUserId: null,
    notice: overrides.actionNotice ?? null,
    winnerMessage: null,
    heroPrompt: null,
    passiveMessage: "Waiting for next hand",
    showTurnCue: false,
    boardReset: false,
    connectionLabel: null,
  };
  return {
    tableId: overrides.tableId ?? "table-1",
    displayState: viewState
      ? deriveTableDisplayState({
          viewState: {
            ...viewState,
            turnCue: overrides.actionsInteractive ?? viewState.turnCue,
          },
          actionNotice: overrides.actionNotice ?? null,
          handResultNotice: overrides.handResultNotice ?? null,
        })
      : emptyDisplayState,
    tournamentStatus: overrides.tournamentStatus ?? null,
    tournamentViewer: overrides.tournamentViewer ?? null,
    debugNowTs: overrides.debugNowTs,
  };
}

describe("useLiveTableStatusStripState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not enter terminal phases during reconnect churn without a latched completed hand", () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => useLiveTableStatusStripState(props),
      {
        initialProps: makeProps({
          sceneMode: "idle",
          snapshot: makeSnapshot({ handId: null }),
        }),
      },
    );

    expect(result.current.statusPhase).toBe("inHand");
    expect(result.current.boardCardsOverride).toBeNull();

    rerender(
      makeProps({
        sceneMode: "idle",
        connectionStatus: "RECONNECTING",
        snapshot: makeSnapshot({ handId: null }),
      }),
    );
    expect(result.current.statusPhase).toBe("transport");
    expect(result.current.message).toBe(RECONNECTING_COPY);
    expect(result.current.boardCardsOverride).toBeNull();

    rerender(
      makeProps({
        sceneMode: "idle",
        snapshot: makeSnapshot({ handId: null }),
      }),
    );
    expect(result.current.statusPhase).toBe("inHand");
    expect(result.current.boardCardsOverride).toBeNull();
  });

  it("does not replay winner hold for the same completed hand after reconnect snapshots", () => {
    const completedHand = makeHandResultNotice("hand-1");
    const { result, rerender } = renderHook(
      (props: HookProps) => useLiveTableStatusStripState(props),
      {
        initialProps: makeProps({
          sceneMode: "idle",
          snapshot: makeSnapshot({ handId: null }),
          handResultNotice: completedHand,
        }),
      },
    );

    expect(result.current.statusPhase).toBe("winnerHold");

    act(() => {
      vi.advanceTimersByTime(WINNER_HOLD_MS);
    });
    expect(result.current.statusPhase).toBe("boardReset");

    act(() => {
      vi.advanceTimersByTime(BOARD_RESET_FADE_MS);
    });
    expect(result.current.statusPhase).toBe("betweenHands");
    expect(result.current.message).toBe(DEALING_NEXT_HAND_COPY);

    rerender(
      makeProps({
        sceneMode: "idle",
        connectionStatus: "RECONNECTING",
        snapshot: makeSnapshot({ handId: null }),
        handResultNotice: completedHand,
      }),
    );
    expect(result.current.statusPhase).toBe("transport");

    rerender(
      makeProps({
        sceneMode: "idle",
        snapshot: makeSnapshot({ handId: null }),
        handResultNotice: completedHand,
      }),
    );
    expect(result.current.statusPhase).toBe("betweenHands");
    expect(result.current.message).toBe(DEALING_NEXT_HAND_COPY);
  });

  it("surfaces add-bot choice instead of dealing spinner when opponents are busted", () => {
    const completedHand = makeHandResultNotice("hand-1");
    const bustedSnapshot = makeSnapshot({ handId: null });
    bustedSnapshot.seats = [
      bustedSnapshot.seats[0],
      {
        ...bustedSnapshot.seats[1],
        stackCents: 0,
        status: "OUT",
        isBot: true,
      },
    ];
    const { result } = renderHook(
      (props: HookProps) => useLiveTableStatusStripState(props),
      {
        initialProps: makeProps({
          sceneMode: "idle",
          snapshot: bustedSnapshot,
          handResultNotice: completedHand,
        }),
      },
    );

    expect(result.current.statusPhase).toBe("winnerHold");

    act(() => {
      vi.advanceTimersByTime(WINNER_HOLD_MS);
    });
    expect(result.current.statusPhase).toBe("boardReset");

    act(() => {
      vi.advanceTimersByTime(BOARD_RESET_FADE_MS);
    });

    expect(result.current.statusPhase).toBe("betweenHands");
    expect(result.current.message).toBe("Add a bot or invite a player");
    expect(result.current.showSpinner).toBe(false);
  });

  it("surfaces rebuy copy instead of dealing spinner when hero is busted", () => {
    const completedHand = makeHandResultNotice("hand-1");
    const bustedHeroSnapshot = makeSnapshot({ handId: null });
    bustedHeroSnapshot.seats = bustedHeroSnapshot.seats.map((seat) =>
      seat.userId === "hero"
        ? { ...seat, stackCents: 0, status: "OUT" as const }
        : seat,
    );
    const { result } = renderHook(
      (props: HookProps) => useLiveTableStatusStripState(props),
      {
        initialProps: makeProps({
          sceneMode: "idle",
          snapshot: bustedHeroSnapshot,
          handResultNotice: completedHand,
        }),
      },
    );

    act(() => {
      vi.advanceTimersByTime(WINNER_HOLD_MS);
    });
    act(() => {
      vi.advanceTimersByTime(BOARD_RESET_FADE_MS);
    });

    expect(result.current.statusPhase).toBe("betweenHands");
    expect(result.current.message).toBe(REBUY_TO_CONTINUE_COPY);
    expect(result.current.showSpinner).toBe(false);
    expect(result.current.message).not.toBe(DEALING_NEXT_HAND_COPY);
  });

  it("does not surface per-action notice bubbles on the felt strip", () => {
    const opponentNotice = makeActionNotice({
      key: "hand-1:1",
      handId: "hand-1",
      actorUserId: "villain",
      message: "Callie bets $2",
    });
    const { result, rerender } = renderHook(
      (props: HookProps) => useLiveTableStatusStripState(props),
      {
        initialProps: makeProps({
          actionNotice: opponentNotice,
        }),
      },
    );

    expect(result.current.message).toBe("Callie to act");

    rerender(
      makeProps({
        actionNotice: makeActionNotice({
          key: "hand-1:2",
          handId: "hand-1",
          actorUserId: "hero",
          message: "Hero calls $2",
        }),
        isHeroTurn: true,
        actionsInteractive: true,
        heroActionOptions: makeHeroActionOptions(),
      }),
    );

    expect(result.current.message).toBe("$1 to call");
    expect(result.current.showSpinner).toBe(false);
  });

  it("keeps strip on passive/hero prompt when notices fire across hands", () => {
    const handOneNotice = makeActionNotice({
      key: "hand-1:1",
      handId: "hand-1",
      actorUserId: "villain",
      message: "Callie folds",
    });
    const { result, rerender } = renderHook(
      (props: HookProps) => useLiveTableStatusStripState(props),
      {
        initialProps: makeProps({
          actionNotice: handOneNotice,
        }),
      },
    );

    expect(result.current.message).toBe("Callie to act");

    act(() => {
      rerender(
        makeProps({
          snapshot: makeSnapshot({ handId: "hand-2" }),
          actionNotice: null,
        }),
      );
    });
    expect(result.current.message).toBe("Callie to act");
  });

  it("ignores throttled notice queue — no action bubbles", () => {
    const noticeOne = makeActionNotice({
      key: "hand-1:1",
      handId: "hand-1",
      actorUserId: "villain",
      message: "Callie bets $2",
    });
    const noticeTwo = makeActionNotice({
      key: "hand-1:2",
      handId: "hand-1",
      actorUserId: "hero",
      message: "Hero calls $2",
    });

    const { result, rerender } = renderHook(
      (props: HookProps) => useLiveTableStatusStripState(props),
      {
        initialProps: makeProps({ actionNotice: noticeOne }),
      },
    );

    expect(result.current.message).toBe("Callie to act");

    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      rerender(makeProps({ actionNotice: noticeTwo }));
    });
    expect(result.current.message).toBe("Callie to act");
  });

  it("shows a spinner only for reconnect or disconnect transport states", () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => useLiveTableStatusStripState(props),
      {
        initialProps: makeProps(),
      },
    );

    expect(result.current.showSpinner).toBe(false);

    rerender(makeProps({ connectionStatus: "DISCONNECTED" }));
    expect(result.current.showSpinner).toBe(true);
    expect(result.current.message).toBe(DISCONNECTED_COPY);
  });

  it("falls back to a safe current message or an interactive prompt when hero can act without an opponent cache", () => {
    const heroNotice = makeActionNotice({
      key: "hand-1:1",
      handId: "hand-1",
      actorUserId: "hero",
      message: "Hero bets $2",
    });
    const { result, rerender } = renderHook(
      (props: HookProps) => useLiveTableStatusStripState(props),
      {
        initialProps: makeProps({
          actionNotice: heroNotice,
        }),
      },
    );

    act(() => {
      rerender(
        makeProps({
          actionNotice: null,
          isHeroTurn: true,
          actionsInteractive: true,
        }),
      );
    });
    // Action notices no longer bubble — hero turn falls through to prompt.
    expect(result.current.message).toBe(YOUR_MOVE_COPY);
    expect(result.current.showSpinner).toBe(false);

    act(() => {
      rerender(
        makeProps({
          tableId: "table-2",
          snapshot: makeSnapshot({
            handId: "hand-2",
            heroActionOptions: makeHeroActionOptions(),
          }),
          actionNotice: null,
          isHeroTurn: true,
          actionsInteractive: true,
          heroActionOptions: makeHeroActionOptions(),
        }),
      );
    });
    expect(result.current.message).toBe("$1 to call");
    expect(result.current.showSpinner).toBe(false);
  });

  it("shows a concrete prompt when a new hand starts and hero is first to act", () => {
    const heroActionOptions = makeHeroActionOptions({
      callAmount: 150,
      minRaiseTo: 350,
    });
    const { result } = renderHook(
      (props: HookProps) => useLiveTableStatusStripState(props),
      {
        initialProps: makeProps({
          snapshot: makeSnapshot({
            handId: "hand-2",
            heroActionOptions,
          }),
          isHeroTurn: true,
          heroActionOptions,
          actionsInteractive: true,
        }),
      },
    );

    expect(result.current.statusPhase).toBe("inHand");
    expect(result.current.message).toBe(`${formatCents(150)} to call`);
    expect(result.current.showSpinner).toBe(false);
  });

  it("falls back to Your move when it is hero turn before action options arrive", () => {
    const { result } = renderHook(
      (props: HookProps) => useLiveTableStatusStripState(props),
      {
        initialProps: makeProps({
          snapshot: makeSnapshot({ handId: "hand-2" }),
          isHeroTurn: true,
          actionsInteractive: false,
          heroActionOptions: null,
        }),
      },
    );

    expect(result.current.statusPhase).toBe("inHand");
    expect(result.current.message).toBe(YOUR_MOVE_COPY);
    expect(result.current.showSpinner).toBe(false);
  });

  it("shows All-in when that is the only remaining hero action", () => {
    const heroActionOptions = makeHeroActionOptions({
      canCall: false,
      canCheck: false,
      canBet: false,
      canRaise: false,
      canAllIn: true,
      primaryWagerAction: "NONE",
      callAmount: 0,
      minRaiseTo: undefined,
      maxRaiseTo: undefined,
    });
    const { result } = renderHook(
      (props: HookProps) => useLiveTableStatusStripState(props),
      {
        initialProps: makeProps({
          snapshot: makeSnapshot({
            handId: "hand-2",
            heroActionOptions,
          }),
          isHeroTurn: true,
          heroActionOptions,
          actionsInteractive: true,
        }),
      },
    );

    expect(result.current.message).toBe(ALL_IN_COPY);
    expect(result.current.showSpinner).toBe(false);
  });

  it("does not carry a cached opponent notice into the next hand after a hand gap", () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => useLiveTableStatusStripState(props),
      {
        initialProps: makeProps({
          actionNotice: makeActionNotice({
            key: "hand-1:1",
            handId: "hand-1",
            actorUserId: "villain",
            message: "Callie calls $2",
          }),
        }),
      },
    );

    expect(result.current.message).toBe("Callie to act");

    rerender(
      makeProps({
        sceneMode: "idle",
        snapshot: makeSnapshot({ handId: null }),
        actionNotice: null,
      }),
    );

    rerender(
      makeProps({
        snapshot: makeSnapshot({
          handId: "hand-2",
          heroActionOptions: makeHeroActionOptions(),
        }),
        actionNotice: null,
        isHeroTurn: true,
        actionsInteractive: true,
        heroActionOptions: makeHeroActionOptions(),
      }),
    );

    expect(result.current.message).toBe("$1 to call");
    expect(result.current.showSpinner).toBe(false);
  });

  it("shows a strip-friendly idle hint when hero is seated alone with no active hand", () => {
    const snapshot = makeSnapshot({ handId: null });
    snapshot.seats = [
      snapshot.seats[0],
      {
        ...snapshot.seats[1],
        occupied: false,
        userId: undefined,
        name: "",
        stackCents: 0,
        status: "OUT",
        connected: false,
      },
    ];
    const { result } = renderHook(
      (props: HookProps) => useLiveTableStatusStripState(props),
      {
        initialProps: makeProps({
          sceneMode: "idle",
          snapshot,
        }),
      },
    );

    expect(result.current.message).toBe("Add a bot to start playing");
    expect(result.current.showSpinner).toBe(false);
  });

  it("keeps the winner message visible during board reset", () => {
    const winnerNotice = makeHandResultNotice("hand-1", {
      winnerName: "Hero Player",
      amountCents: 400,
    });
    const { result } = renderHook(
      (props: HookProps) => useLiveTableStatusStripState(props),
      {
        initialProps: makeProps({
          sceneMode: "idle",
          snapshot: makeSnapshot({ handId: null }),
          handResultNotice: winnerNotice,
        }),
      },
    );

    expect(result.current.statusPhase).toBe("winnerHold");
    expect(result.current.message).toContain("Hero Player wins $4");

    act(() => {
      vi.advanceTimersByTime(WINNER_HOLD_MS);
    });

    expect(result.current.statusPhase).toBe("boardReset");
    expect(result.current.message).toContain("Hero Player wins $4");
    expect(result.current.showSpinner).toBe(false);
    expect(result.current.boardCardsOverride).not.toBeNull();
    expect(result.current.potCentsOverride).toBe(0);
  });

  it("keeps terminal winner copy above any local pending action state", () => {
    const winnerNotice = makeHandResultNotice("hand-1");
    const { result } = renderHook(
      (props: HookProps) => useLiveTableStatusStripState(props),
      {
        initialProps: makeProps({
          sceneMode: "idle",
          snapshot: makeSnapshot({ handId: null }),
          handResultNotice: winnerNotice,
          pendingAction: makePendingAction(Date.now() - 10_000),
        }),
      },
    );

    expect(result.current.statusPhase).toBe("winnerHold");
    expect(result.current.message).toContain("Hero Player wins $4");
    expect(result.current.showSpinner).toBe(false);
  });

  it("cancels terminal phases immediately when a new hand starts early", () => {
    const winnerNotice = makeHandResultNotice("hand-1");
    const { result, rerender } = renderHook(
      (props: HookProps) => useLiveTableStatusStripState(props),
      {
        initialProps: makeProps({
          sceneMode: "idle",
          snapshot: makeSnapshot({ handId: null }),
          handResultNotice: winnerNotice,
        }),
      },
    );

    act(() => {
      vi.advanceTimersByTime(WINNER_HOLD_MS - 200);
    });
    expect(result.current.statusPhase).toBe("winnerHold");

    rerender(
      makeProps({
        sceneMode: "active",
        snapshot: makeSnapshot({ handId: "hand-2", board: ["9h", "8d", "7c"] }),
        handResultNotice: winnerNotice,
      }),
    );

    expect(result.current.statusPhase).toBe("inHand");
    expect(result.current.boardCardsOverride).toBeNull();
    expect(result.current.potCentsOverride).toBeUndefined();
  });

  it("self-heals terminal flow into between-hands state after the timeout guard", () => {
    const winnerNotice = makeHandResultNotice("hand-1");
    const { result } = renderHook(
      (props: HookProps) => useLiveTableStatusStripState(props),
      {
        initialProps: makeProps({
          sceneMode: "active",
          snapshot: makeSnapshot({ handId: null }),
          handResultNotice: winnerNotice,
        }),
      },
    );

    expect(result.current.statusPhase).toBe("winnerHold");

    act(() => {
      vi.advanceTimersByTime(TERMINAL_TIMEOUT_MS);
    });
    act(() => {
      vi.advanceTimersByTime(BOARD_RESET_FADE_MS);
    });

    expect(result.current.statusPhase).toBe("betweenHands");
    expect(result.current.message).toBe(DEALING_NEXT_HAND_COPY);
    expect(result.current.showSpinner).toBe(true);
  });

  it("clears cached strip state when switching tables", () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => useLiveTableStatusStripState(props),
      {
        initialProps: makeProps({
          actionNotice: makeActionNotice({
            key: "hand-1:1",
            handId: "hand-1",
            actorUserId: "villain",
            message: "Callie checks",
          }),
        }),
      },
    );

    expect(result.current.message).toBe("Callie to act");

    act(() => {
      rerender(
        makeProps({
          tableId: "table-2",
          snapshot: {
            ...makeSnapshot({ handId: "hand-2" }),
            table: { ...makeSnapshot({ handId: "hand-2" }).table, tableId: "table-2" },
          },
        }),
      );
    });

    expect(result.current.message).toBe("Callie to act");
  });

  it("shows tournament complete without spinner when tournamentStatus becomes FINISHED in betweenHands", () => {
    const winnerNotice = makeHandResultNotice("hand-1");
    const { result, rerender } = renderHook(
      (props: HookProps) => useLiveTableStatusStripState(props),
      {
        initialProps: makeProps({
          sceneMode: "idle",
          snapshot: makeSnapshot({ handId: null }),
          handResultNotice: winnerNotice,
          tournamentStatus: "RUNNING",
        }),
      },
    );

    act(() => {
      vi.advanceTimersByTime(WINNER_HOLD_MS);
    });
    act(() => {
      vi.advanceTimersByTime(BOARD_RESET_FADE_MS);
    });
    expect(result.current.statusPhase).toBe("betweenHands");
    expect(result.current.message).toBe(DEALING_NEXT_HAND_COPY);
    expect(result.current.showSpinner).toBe(true);

    rerender(
      makeProps({
        sceneMode: "idle",
        snapshot: makeSnapshot({ handId: null }),
        handResultNotice: winnerNotice,
        tournamentStatus: "FINISHED",
        tournamentViewer: { isWinner: true },
      }),
    );
    expect(result.current.message).toBe(TOURNAMENT_FINISHED_COPY);
    expect(result.current.showSpinner).toBe(false);
  });

  it("shows eliminated copy without spinner for busted player in betweenHands", () => {
    const winnerNotice = makeHandResultNotice("hand-1");
    const { result, rerender } = renderHook(
      (props: HookProps) => useLiveTableStatusStripState(props),
      {
        initialProps: makeProps({
          sceneMode: "idle",
          snapshot: makeSnapshot({ handId: null }),
          handResultNotice: winnerNotice,
          tournamentStatus: "RUNNING",
        }),
      },
    );

    act(() => {
      vi.advanceTimersByTime(WINNER_HOLD_MS);
    });
    act(() => {
      vi.advanceTimersByTime(BOARD_RESET_FADE_MS);
    });
    expect(result.current.statusPhase).toBe("betweenHands");

    rerender(
      makeProps({
        sceneMode: "idle",
        snapshot: makeSnapshot({ handId: null }),
        handResultNotice: winnerNotice,
        tournamentStatus: "FINISHED",
        tournamentViewer: { isEliminated: true },
      }),
    );
    expect(result.current.message).toBe(TOURNAMENT_ELIMINATED_COPY);
    expect(result.current.showSpinner).toBe(false);
    expect(result.current.message).not.toBe(DEALING_NEXT_HAND_COPY);
  });

  it("resolveBetweenHandsTournamentMessage shows rebuy available for pending viewer", () => {
    expect(
      resolveBetweenHandsTournamentMessage("RUNNING", { rebuyPending: true }),
    ).toBe(TOURNAMENT_REBUY_AVAILABLE_COPY);
  });

  it("mergeTournamentViewer keeps eliminated viewer across lightweight snapshots", () => {
    expect(
      mergeTournamentViewer(undefined, { isEliminated: true, finishPlace: 7 }),
    ).toMatchObject({ isEliminated: true, finishPlace: 7 });
    expect(mergeTournamentViewer(null, { isEliminated: true })).toMatchObject({
      isEliminated: true,
    });
    expect(
      mergeTournamentViewer({ isWinner: true }, { isEliminated: true }),
    ).toMatchObject({ isWinner: true });
  });
});
