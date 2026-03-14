import { describe, expect, it } from "vitest";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { buildTableSceneModel } from "./useTableSceneModel";

function makeCanonicalLessonSnapshotMissingWagerBounds(): TableSnapshotPayload {
  return {
    version: 1,
    snapshotId: "lesson_snap_1",
    snapshotSeq: 1,
    emittedAtTs: Date.now(),
    serverTimeTs: Date.now(),
    stateHash: "lesson_state_hash",
    reason: "ACTION_ACCEPTED",
    lessonSnapshotVersion: 2,
    table: {
      tableId: "lesson_table",
      tableName: "Lesson Table",
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
        seat: 1,
        occupied: true,
        userId: "villain",
        name: "Villain",
        stackCents: 1800,
        roundBetCents: 100,
        committedCents: 100,
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
    hero: {
      userId: "hero",
      youAreSeated: true,
      seat: 2,
      holeCards: ["As", "Kh"],
      actionOptions: {
        canFold: false,
        canCheck: false,
        canCall: false,
        canBet: false,
        canRaise: true,
        canAllIn: false,
        primaryWagerAction: "RAISE",
        callAmount: 0,
      },
    },
    hand: {
      handId: "hand_1",
      handNumber: 1,
      street: "PREFLOP",
      board: [],
      potCents: 150,
      dealerSeat: 2,
      sbSeat: 2,
      bbSeat: 1,
      toActSeat: 2,
      actionCount: 0,
      roundCurrentBetCents: 100,
      minRaiseCents: 100,
    },
  };
}

describe("buildTableSceneModel", () => {
  it("repairs missing wager bounds for canonical lesson snapshots so wager actions still render", () => {
    const snapshot = makeCanonicalLessonSnapshotMissingWagerBounds();

    const scene = buildTableSceneModel(snapshot, null, "CONNECTED");

    expect(scene.heroActionOptions?.minRaiseTo).toBe(200);
    expect(scene.heroActionOptions?.maxRaiseTo).toBe(2250);
    expect(scene.actionContext.showActions).toBe(true);
    expect(scene.actionContext.allowedActions.WAGER).toBe(true);
  });
});
