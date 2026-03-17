import { describe, expect, it } from "vitest";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { TableDisplayEvents } from "@/features/table";
import { resolveDisplayEventsForRender } from "./displayEventsPolicy";

function makeSnapshot({
  handId = "hand-1",
  occupiedHumans = 2,
  lastHandResultHandId,
}: {
  handId?: string | null;
  occupiedHumans?: number;
  lastHandResultHandId?: string;
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
        occupied: occupiedHumans >= 1,
        userId: occupiedHumans >= 1 ? "hero" : undefined,
        name: "Hero Player",
        stackCents: 2000,
        roundBetCents: 0,
        committedCents: 0,
        connected: true,
        disconnectDeadlineTs: 0,
        isDealer: false,
        status: "ACTIVE",
        isToAct: false,
        isBot: false,
      },
      {
        seat: 1,
        occupied: occupiedHumans >= 2,
        userId: occupiedHumans >= 2 ? "villain" : undefined,
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
      youAreSeated: occupiedHumans >= 1,
      seat: occupiedHumans >= 1 ? 0 : undefined,
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
            toActSeat: 1,
            actionCount: 0,
            roundCurrentBetCents: 100,
            minRaiseCents: 100,
            potCents: 150,
            board: [],
          },
    lastHandResult: lastHandResultHandId
      ? {
          handId: lastHandResultHandId,
          reason: "LAST_PLAYER",
          potCents: 300,
          winnerId: "hero",
          payoutsByUserId: {
            hero: 300,
          },
          board: ["As", "Kd", "7c", "4h", "2s"],
        }
      : undefined,
  };
}

describe("resolveDisplayEventsForRender", () => {
  it("suppresses stale winner banners on fresh open before an active hand is observed", () => {
    const translatedEvents: TableDisplayEvents = {
      actionNotice: null,
      winnerBanner: {
        handId: "hand-1",
        winnerName: "Hero Player",
        amountCents: 300,
      },
    };

    const result = resolveDisplayEventsForRender({
      translatedEvents,
      snapshot: makeSnapshot({ handId: null, lastHandResultHandId: "hand-1" }),
      hasObservedActiveHand: false,
      previousOccupiedHumanCount: 2,
      hiddenWinnerHandId: null,
    });

    expect(result.winnerBanner).toBeNull();
  });

  it("suppresses winner banners when a human leaves and the table is idle", () => {
    const translatedEvents: TableDisplayEvents = {
      actionNotice: null,
      winnerBanner: {
        handId: "hand-2",
        winnerName: "Hero Player",
        amountCents: 300,
      },
    };

    const result = resolveDisplayEventsForRender({
      translatedEvents,
      snapshot: makeSnapshot({ handId: null, occupiedHumans: 1, lastHandResultHandId: "hand-2" }),
      hasObservedActiveHand: true,
      previousOccupiedHumanCount: 2,
      hiddenWinnerHandId: null,
    });

    expect(result.winnerBanner).toBeNull();
  });

  it("allows translated winner banners when the session has observed active play", () => {
    const translatedEvents: TableDisplayEvents = {
      actionNotice: null,
      winnerBanner: {
        handId: "hand-3",
        winnerName: "Hero Player",
        amountCents: 300,
      },
    };

    const result = resolveDisplayEventsForRender({
      translatedEvents,
      snapshot: makeSnapshot({ handId: null, lastHandResultHandId: "hand-3" }),
      hasObservedActiveHand: true,
      previousOccupiedHumanCount: 2,
      hiddenWinnerHandId: null,
    });

    expect(result.winnerBanner?.handId).toBe("hand-3");
  });
});
