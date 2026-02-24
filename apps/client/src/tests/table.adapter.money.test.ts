import { describe, expect, it } from "vitest";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { getHeroStackCents, getPotCents, mapSeatsToOpponents } from "@/components/domain/table/table.adapter";

function makeSnapshot(): TableSnapshotPayload {
  return {
    version: 1,
    snapshotId: "snap_money",
    snapshotSeq: 1,
    emittedAtTs: Date.now(),
    serverTimeTs: Date.now(),
    stateHash: "state_hash",
    reason: "ACTION_ACCEPTED",
    table: {
      tableId: "t1",
      tableName: "Table 1",
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
        name: "Hero",
        stackCents: 2200,
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
        occupied: true,
        userId: "villain",
        name: "Villain",
        stackCents: 1800,
        roundBetCents: 0,
        committedCents: 0,
        connected: true,
        disconnectDeadlineTs: 0,
        isDealer: true,
        status: "ACTIVE",
        isToAct: true,
        isBot: false,
      },
    ],
    hero: {
      userId: "hero",
      youAreSeated: true,
      seat: 0,
    },
    hand: {
      handId: "h1",
      handNumber: 9,
      street: "TURN",
      board: ["As", "Kd", "7h", "2c"],
      potCents: 900,
      dealerSeat: 1,
      sbSeat: 0,
      bbSeat: 1,
      toActSeat: 1,
      actionCount: 12,
      roundCurrentBetCents: 0,
      minRaiseCents: 0,
    },
    lastHandResult: {
      handId: "h0",
      reason: "SHOWDOWN",
      winnerId: "hero",
      winningHandDescr: "Pair",
      potCents: 777,
      payoutsByUserId: {
        hero: 777,
      },
      showdownHoleCardsByUserId: {
        villain: ["Kh", "Qh"],
      },
    },
  };
}

describe("table adapter money mapping", () => {
  it("maps hero stack from snapshot seat data exactly", () => {
    const snapshot = makeSnapshot();
    expect(getHeroStackCents(snapshot)).toBe(2200);
  });

  it("falls back to hero userId seat when hero.seat is missing", () => {
    const snapshot = makeSnapshot();
    const inconsistentSnapshot: TableSnapshotPayload = {
      ...snapshot,
      hero: {
        ...snapshot.hero,
        seat: undefined,
        youAreSeated: true,
      },
      hand: {
        ...snapshot.hand!,
        toActSeat: 0,
        dealerSeat: 0,
      },
    };

    expect(getHeroStackCents(inconsistentSnapshot)).toBe(2200);
  });

  it("keeps hero stack stable on hand-start style payloads with zero pot", () => {
    const snapshot = makeSnapshot();
    const handStartSnapshot: TableSnapshotPayload = {
      ...snapshot,
      snapshotSeq: 2,
      reason: "HAND_START",
      hand: {
        ...snapshot.hand!,
        handId: "h2",
        street: "PREFLOP",
        board: [],
        potCents: 0,
        actionCount: 0,
      },
      seats: snapshot.seats.map((seat) => ({
        ...seat,
        roundBetCents: 0,
        committedCents: 0,
      })),
    };

    expect(getHeroStackCents(handStartSnapshot)).toBe(2200);
  });

  it("maps pot from active hand first, then falls back to last hand result", () => {
    const snapshot = makeSnapshot();
    expect(getPotCents(snapshot)).toBe(900);

    const noHandSnapshot: TableSnapshotPayload = {
      ...snapshot,
      hand: undefined,
    };

    expect(getPotCents(noHandSnapshot)).toBe(777);
  });

  it("maps opponent cards as face-down while hand is active", () => {
    const snapshot = makeSnapshot();
    const opponents = mapSeatsToOpponents(snapshot);
    expect(opponents[0]?.cards).toEqual({ faceDown: true, visible: true });
  });

  it("maps opponent showdown cards as face-up when waiting after showdown", () => {
    const snapshot = makeSnapshot();
    const noHandSnapshot: TableSnapshotPayload = {
      ...snapshot,
      hand: undefined,
    };

    const opponents = mapSeatsToOpponents(noHandSnapshot);
    expect(opponents[0]?.cards).toEqual({
      left: { rank: "K", suit: "h" },
      right: { rank: "Q", suit: "h" },
      faceDown: false,
      visible: true,
    });
  });

  it("hides opponent cards in waiting state when last result is not showdown", () => {
    const snapshot = makeSnapshot();
    const noShowdownSnapshot: TableSnapshotPayload = {
      ...snapshot,
      hand: undefined,
      lastHandResult: {
        ...snapshot.lastHandResult!,
        reason: "LAST_PLAYER",
        showdownHoleCardsByUserId: undefined,
      },
    };

    const opponents = mapSeatsToOpponents(noShowdownSnapshot);
    expect(opponents[0]?.cards).toBeUndefined();
  });

  it("does not show in-hand card backs for occupied opponents who are out of the hand", () => {
    const snapshot = makeSnapshot();
    const activeWithOutSeat: TableSnapshotPayload = {
      ...snapshot,
      seats: [
        ...snapshot.seats,
        {
          seat: 2,
          occupied: true,
          userId: "sitting_out",
          name: "SittingOut",
          stackCents: 0,
          roundBetCents: 0,
          committedCents: 0,
          connected: true,
          disconnectDeadlineTs: 0,
          isDealer: false,
          status: "OUT",
          isToAct: false,
          isBot: false,
        },
      ],
    };

    const opponents = mapSeatsToOpponents(activeWithOutSeat);
    const outSeat = opponents.find((o) => o.id === "sitting_out");
    expect(outSeat?.cards).toBeUndefined();
  });
});
