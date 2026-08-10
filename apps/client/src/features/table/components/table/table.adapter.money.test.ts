import { describe, expect, it } from "vitest";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { getHeroDisplayStatus, getHeroStackCents, getPotCents, mapSeatsToOpponents } from "./table.adapter";

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
      seats: snapshot.seats.map((seat: any) => ({
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
    const snapshot: TableSnapshotPayload = {
      ...makeSnapshot(),
      lastHandResult: undefined,
    };
    const opponents = mapSeatsToOpponents(snapshot);
    expect(opponents[0]?.cards).toEqual({ faceDown: true, visible: true });
  });

  it("after all-in showdown, shows stacks instead of All-In for winner and busted seats", () => {
    const snapshot = makeSnapshot();
    const settled: TableSnapshotPayload = {
      ...snapshot,
      hand: {
        ...snapshot.hand!,
        handId: "h1",
        street: "SHOWDOWN",
        potCents: 0,
        board: ["As", "Kd", "7h", "2c", "9s"],
        toActSeat: null as unknown as number,
      },
      seats: [
        { ...snapshot.seats[0], status: "ALL_IN", stackCents: 4400 },
        { ...snapshot.seats[1], status: "ALL_IN", stackCents: 0, isBot: true },
      ],
      lastHandResult: {
        handId: "h1",
        reason: "SHOWDOWN",
        winnerId: "hero",
        potCents: 3600,
        payoutsByUserId: { hero: 3600 },
        board: ["As", "Kd", "7h", "2c", "9s"],
      },
    };

    expect(getHeroDisplayStatus(settled)).toBe("ACTIVE");
    expect(getHeroStackCents(settled)).toBe(4400);

    const opponents = mapSeatsToOpponents(settled);
    expect(opponents[0]?.status).toBe("sittingOut");
    expect(opponents[0]?.stackCents).toBe(0);
  });

  it("keeps All-In status while the hand is still live (not yet settled)", () => {
    const snapshot = makeSnapshot();
    const liveAllIn: TableSnapshotPayload = {
      ...snapshot,
      lastHandResult: undefined,
      seats: [
        { ...snapshot.seats[0], status: "ALL_IN", stackCents: 0 },
        { ...snapshot.seats[1], status: "ALL_IN", stackCents: 0 },
      ],
    };

    expect(getHeroDisplayStatus(liveAllIn)).toBe("ALL_IN");
    expect(mapSeatsToOpponents(liveAllIn)[0]?.status).toBe("allIn");
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

  it("maps opponent showdown cards as face-up even when hand frame is present", () => {
    const snapshot = makeSnapshot();
    const opponents = mapSeatsToOpponents(snapshot);
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

  it("orders opponents by seat relative to the hero", () => {
    const snapshot = makeSnapshot();
    const orderingSnapshot: TableSnapshotPayload = {
      ...snapshot,
      hero: {
        ...snapshot.hero,
        seat: 2,
      },
      seats: [
        {
          seat: 0,
          occupied: true,
          userId: "p0",
          name: "P0",
          stackCents: 1000,
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
          userId: "p1",
          name: "P1",
          stackCents: 1000,
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
          seat: 2,
          occupied: true,
          userId: "hero",
          name: "Hero",
          stackCents: 1000,
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
          seat: 3,
          occupied: true,
          userId: "p3",
          name: "P3",
          stackCents: 1000,
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
          seat: 4,
          occupied: true,
          userId: "p4",
          name: "P4",
          stackCents: 1000,
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
          seat: 5,
          occupied: true,
          userId: "p5",
          name: "P5",
          stackCents: 1000,
          roundBetCents: 0,
          committedCents: 0,
          connected: true,
          disconnectDeadlineTs: 0,
          isDealer: false,
          status: "ACTIVE",
          isToAct: false,
          isBot: false,
        },
      ],
    };

    const opponents = mapSeatsToOpponents(orderingSnapshot);
    const idsInOrder = opponents.map((o) => o.id);
    expect(idsInOrder).toEqual(["p3", "p4", "p5", "p0", "p1"]);
  });

  it("orders opponents when hero is at seat 0 (heroSeat falsy but valid)", () => {
    const snapshot = makeSnapshot();
    const heroAtZero: TableSnapshotPayload = {
      ...snapshot,
      hero: { ...snapshot.hero, seat: 0 },
      table: { ...snapshot.table, maxSeats: 6 },
      seats: [0, 1, 2, 3, 4, 5].map((seat) => ({
        seat,
        occupied: true,
        userId: seat === 0 ? "hero" : `p${seat}`,
        name: seat === 0 ? "Hero" : `P${seat}`,
        stackCents: 1000,
        roundBetCents: 0,
        committedCents: 0,
        connected: true,
        disconnectDeadlineTs: 0,
        isDealer: false,
        status: "ACTIVE" as const,
        isToAct: false,
        isBot: false,
      })),
    };

    const opponents = mapSeatsToOpponents(heroAtZero);
    const idsInOrder = opponents.map((o) => o.id);
    expect(idsInOrder).toEqual(["p1", "p2", "p3", "p4", "p5"]);
  });

  it("keeps occupied opponents when malformed lesson snapshots reuse the hero userId", () => {
    const snapshot = makeSnapshot();
    const malformedLessonSnapshot: TableSnapshotPayload = {
      ...snapshot,
      hero: {
        userId: "user_1",
        youAreSeated: true,
        seat: 2,
      },
      seats: [
        {
          seat: 1,
          occupied: true,
          userId: "user_1",
          name: "Villain",
          stackCents: 1800,
          roundBetCents: 100,
          committedCents: 100,
          connected: true,
          disconnectDeadlineTs: 0,
          isDealer: false,
          status: "ACTIVE",
          isToAct: false,
          isBot: true,
        },
        {
          seat: 2,
          occupied: true,
          userId: "user_1",
          name: "Hero",
          stackCents: 2200,
          roundBetCents: 50,
          committedCents: 50,
          connected: true,
          disconnectDeadlineTs: 0,
          isDealer: true,
          status: "ACTIVE",
          isToAct: true,
          isBot: false,
        },
      ],
      hand: {
        ...snapshot.hand!,
        dealerSeat: 2,
        sbSeat: 2,
        bbSeat: 1,
        toActSeat: 2,
      },
      lastHandResult: undefined,
    };

    const opponents = mapSeatsToOpponents(malformedLessonSnapshot);
    expect(opponents).toHaveLength(1);
    expect(opponents[0]?.seat).toBe(1);
    expect(opponents[0]?.name).toBe("Villain");
    expect(opponents[0]?.cards).toEqual({ faceDown: true, visible: true });
  });
});

