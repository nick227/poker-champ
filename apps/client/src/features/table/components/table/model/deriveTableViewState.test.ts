import { describe, expect, it } from "vitest";
import type {
  HeroActionOptions,
  TableSnapshotPayload,
} from "@poker-champ/realtime-contract";
import { formatCents } from "@/lib/format";
import { deriveTableViewState } from "./deriveTableViewState";

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

function makeSnapshot({
  handId = "hand-1",
  street = "PREFLOP" as const,
  board = [] as string[],
  toActSeat = 0 as number | null,
  heroSeat = 0,
  heroActionOptions = makeHeroActionOptions(),
  connectionStatus = "CONNECTED" as const,
}: {
  handId?: string | null;
  street?: "PREFLOP" | "FLOP" | "TURN" | "RIVER";
  board?: string[];
  toActSeat?: number | null;
  heroSeat?: number;
  heroActionOptions?: HeroActionOptions | undefined;
  connectionStatus?: "CONNECTED" | "RECONNECTING" | "DISCONNECTED";
} = {}): {
  snapshot: TableSnapshotPayload;
  connectionStatus: "CONNECTED" | "RECONNECTING" | "DISCONNECTED";
} {
  return {
    connectionStatus,
    snapshot: {
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
          isToAct: toActSeat === 0,
          isBot: false,
        },
        {
          seat: 1,
          occupied: true,
          userId: "villain",
          name: "Callie Doyle",
          stackCents: 2000,
          roundBetCents: 100,
          committedCents: 100,
          connected: true,
          disconnectDeadlineTs: 0,
          isDealer: true,
          status: "ACTIVE",
          isToAct: toActSeat === 1,
          isBot: false,
        },
      ],
      hero: {
        userId: "hero",
        youAreSeated: true,
        seat: heroSeat,
        actionOptions: heroActionOptions,
      },
      hand:
        handId == null
          ? undefined
          : ({
              handId,
              handNumber: 1,
              street,
              dealerSeat: 1,
              sbSeat: 0,
              bbSeat: 1,
              toActSeat,
              actionCount: 0,
              roundCurrentBetCents: 100,
              minRaiseCents: 100,
              potCents: 400,
              board,
            } as TableSnapshotPayload["hand"]),
    },
  };
}

describe("deriveTableViewState", () => {
  it("returns WAITING state when there is no active hand", () => {
    const { snapshot, connectionStatus } = makeSnapshot({ handId: null });

    const viewState = deriveTableViewState(snapshot, connectionStatus);

    expect(viewState.phase).toBe("WAITING");
    expect(viewState.handId).toBeNull();
    expect(viewState.heroTurn).toBe(false);
    expect(viewState.actionsInteractive).toBe(false);
    expect(viewState.boardResetEligible).toBe(false);
    expect(viewState.passiveMessage).toBe("Waiting for next hand");
  });

  it("asks for rebuy when hero is busted between hands", () => {
    const { snapshot, connectionStatus } = makeSnapshot({ handId: null });
    snapshot.seats = snapshot.seats.map((seat) =>
      seat.userId === "hero"
        ? { ...seat, stackCents: 0, status: "OUT" }
        : seat,
    );

    const viewState = deriveTableViewState(snapshot, connectionStatus);

    expect(viewState.passiveMessage).toBe("Rebuy to get back in");
  });

  it("maps live streets directly into render phase", () => {
    const streets = [
      { street: "PREFLOP" as const, expected: "PREFLOP" },
      { street: "FLOP" as const, expected: "FLOP" },
      { street: "TURN" as const, expected: "TURN" },
      { street: "RIVER" as const, expected: "RIVER" },
    ];

    for (const { street, expected } of streets) {
      const { snapshot, connectionStatus } = makeSnapshot({ street });
      const viewState = deriveTableViewState(snapshot, connectionStatus);
      expect(viewState.phase).toBe(expected);
      expect(viewState.street).toBe(expected);
    }
  });

  it("returns SHOWDOWN when the hand is active but nobody is to act", () => {
    const { snapshot, connectionStatus } = makeSnapshot({ toActSeat: null });

    const viewState = deriveTableViewState(snapshot, connectionStatus);

    expect(viewState.phase).toBe("SHOWDOWN");
    expect(viewState.heroTurn).toBe(false);
    expect(viewState.actionsInteractive).toBe(false);
    expect(viewState.passiveMessage).toBe("Showdown");
  });

  it("derives hero prompts and interactive flags from the snapshot only", () => {
    const { snapshot, connectionStatus } = makeSnapshot({
      heroActionOptions: makeHeroActionOptions({
        callAmount: 150,
        minRaiseTo: 350,
      }),
    });

    const viewState = deriveTableViewState(snapshot, connectionStatus);

    expect(viewState.heroTurn).toBe(true);
    expect(viewState.heroPrompt).toBe(`${formatCents(150)} to call`);
    expect(viewState.turnCue).toBe(true);
    expect(viewState.actionsInteractive).toBe(true);
  });

  it("falls back to Your move when hero options are missing", () => {
    const { snapshot, connectionStatus } = makeSnapshot({
      heroActionOptions: undefined,
    });
    snapshot.hero.actionOptions = undefined;

    const viewState = deriveTableViewState(snapshot, connectionStatus);

    expect(viewState.heroTurn).toBe(true);
    expect(viewState.heroPrompt).toBe("Your move");
  });

  it("derives passive opponent messaging when hero is not to act", () => {
    const { snapshot, connectionStatus } = makeSnapshot({
      toActSeat: 1,
    });

    const viewState = deriveTableViewState(snapshot, connectionStatus);

    expect(viewState.heroTurn).toBe(false);
    expect(viewState.passiveMessage).toBe("Callie to act");
    expect(viewState.actionsInteractive).toBe(false);
  });

  it("sets boardResetEligible only when a completed result exists with no active hand", () => {
    const { snapshot, connectionStatus } = makeSnapshot({ handId: null });
    snapshot.lastHandResult = {
      handId: "hand-1",
      reason: "SHOWDOWN",
      potCents: 400,
      winnerId: "hero",
      payoutsByUserId: {
        hero: 400,
      },
    };

    const viewState = deriveTableViewState(snapshot, connectionStatus);

    expect(viewState.boardResetEligible).toBe(true);
    expect(viewState.completedHandId).toBe("hand-1");
  });

  it("surfaces transport state from connection status without changing gameplay fields", () => {
    const { snapshot, connectionStatus } = makeSnapshot({
      connectionStatus: "RECONNECTING",
      heroActionOptions: makeHeroActionOptions({
        callAmount: 150,
      }),
    });

    const viewState = deriveTableViewState(snapshot, connectionStatus);

    expect(viewState.phase).toBe("PREFLOP");
    expect(viewState.connectionLabel).toBe("Reconnecting...");
    expect(viewState.turnCue).toBe(false);
    expect(viewState.heroPrompt).toBe("$1.5 to call");
  });
});
