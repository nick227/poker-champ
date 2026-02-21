import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

/**
 * Creates a lesson snapshot shaped as TableSnapshotPayload with optional lesson metadata.
 * 
 * Lesson snapshots are simply normal TableSnapshotPayload objects with optional 
 * lesson metadata attached under snapshot.lesson.
 */
export function buildLessonSnapshot(lessonId: string): TableSnapshotPayload {
  // For MVP, create one hardcoded lesson scenario
  // In future, this would load from lesson data
  
  switch (lessonId) {
    case "preflop-raise-decision":
      return createPreflopRaiseDecisionLesson();
    case "continuation-bet-spot":
      return createContinuationBetLesson();
    default:
      return createPreflopRaiseDecisionLesson();
  }
}

/**
 * Lesson: Preflop Raise Decision
 * 
 * Scenario: Hero has AK in MP, facing a raise from UTG
 * Question: Should Hero fold, call, or 3-bet?
 */
function createPreflopRaiseDecisionLesson(): TableSnapshotPayload {
  return {
    version: 1,
    snapshotId: "lesson-preflop-raise-decision",
    snapshotSeq: 1,
    emittedAtTs: Date.now(),
    serverTimeTs: Date.now(),
    stateHash: "lesson-hash-1",
    reason: "ACTION_ACCEPTED",
    table: {
      tableId: "lesson-table",
      tableName: "Preflop Decision Lesson",
      visibility: "PRIVATE",
      maxSeats: 6,
      smallBlindCents: 100,
      bigBlindCents: 200,
      minBuyInCents: 2000,
      maxBuyInCents: 200000,
    },
    hand: {
      handId: "lesson-hand-1",
      handNumber: 1,
      street: "PREFLOP",
      dealerSeat: 5,
      sbSeat: 0,
      bbSeat: 1,
      toActSeat: 2,
      actionCount: 2,
      roundCurrentBetCents: 400,
      minRaiseCents: 600,
      potCents: 600,
      board: [],
    },
    seats: [
      {
        seat: 0,
        occupied: true,
        userId: "opponent-utg",
        isBot: false,
        name: "UTG Player",
        status: "ACTIVE",
        stackCents: 1600,
        roundBetCents: 400,
        committedCents: 400,
        connected: true,
        disconnectDeadlineTs: 0,
        isDealer: false,
        isToAct: false,
      },
      {
        seat: 1,
        occupied: true,
        userId: "opponent-bb",
        isBot: false,
        name: "Big Blind",
        status: "ACTIVE",
        stackCents: 1800,
        roundBetCents: 200,
        committedCents: 200,
        connected: true,
        disconnectDeadlineTs: 0,
        isDealer: true,
        isToAct: false,
      },
      {
        seat: 2,
        occupied: true,
        userId: "hero-user",
        isBot: false,
        name: "Hero",
        status: "ACTIVE",
        stackCents: 2000,
        roundBetCents: 0,
        committedCents: 0,
        connected: true,
        disconnectDeadlineTs: 0,
        isDealer: false,
        isToAct: true,
      },
      {
        seat: 3,
        occupied: false,
        isBot: false,
        name: "",
        status: "OUT",
        stackCents: 0,
        roundBetCents: 0,
        committedCents: 0,
        connected: false,
        disconnectDeadlineTs: 0,
        isDealer: false,
        isToAct: false,
      },
      {
        seat: 4,
        occupied: false,
        isBot: false,
        name: "",
        status: "OUT",
        stackCents: 0,
        roundBetCents: 0,
        committedCents: 0,
        connected: false,
        disconnectDeadlineTs: 0,
        isDealer: false,
        isToAct: false,
      },
      {
        seat: 5,
        occupied: false,
        isBot: false,
        name: "",
        status: "OUT",
        stackCents: 0,
        roundBetCents: 0,
        committedCents: 0,
        connected: false,
        disconnectDeadlineTs: 0,
        isDealer: false,
        isToAct: false,
      },
    ],
    hero: {
      userId: "hero-user",
      youAreSeated: true,
      seat: 2,
      holeCards: ["A♠", "K♦"], // Hero's hole cards
      actionOptions: {
        canFold: true,
        canCheck: false,
        canCall: true,
        canBet: false,
        canRaise: true,
        canAllIn: false,
        primaryWagerAction: "RAISE",
        callAmount: 400,
        minRaiseTo: 600,
        maxRaiseTo: 2000,
      },
      calculations: {
        mode: "LIVE_ADVISORY",
        stale: false,
        equityPct: 65, // 65% equity vs range
        potOddsPct: 40, // 40% pot odds
        updatedAtTs: Date.now(),
      },
    },
    lastAction: {
      handId: "lesson-hand-1",
      seq: 1,
      street: "PREFLOP",
      actorUserId: "opponent-utg",
      actorKind: "HUMAN",
      action: "RAISE",
      amountCents: 400,
      raiseToCents: 400,
      potAfterCents: 600,
      origin: "PLAYER",
      createdAtTs: Date.now(),
    },
    // Note: lesson metadata will be added later when extending TableSnapshotPayload
  };
}

/**
 * Lesson: Continuation Bet Spot
 * 
 * Scenario: Hero raised preflop, got one caller, now on flop
 * Question: Should Hero check or continuation bet?
 */
function createContinuationBetLesson(): TableSnapshotPayload {
  return {
    version: 1,
    snapshotId: "lesson-cbet-spot",
    snapshotSeq: 1,
    emittedAtTs: Date.now(),
    serverTimeTs: Date.now(),
    stateHash: "lesson-hash-2",
    reason: "ACTION_ACCEPTED",
    table: {
      tableId: "lesson-table",
      tableName: "Continuation Bet Lesson",
      visibility: "PRIVATE",
      maxSeats: 6,
      smallBlindCents: 100,
      bigBlindCents: 200,
      minBuyInCents: 2000,
      maxBuyInCents: 200000,
    },
    hand: {
      handId: "lesson-hand-2",
      handNumber: 1,
      street: "FLOP",
      dealerSeat: 5,
      sbSeat: 1,
      bbSeat: 2,
      toActSeat: 0,
      actionCount: 3,
      roundCurrentBetCents: 0,
      minRaiseCents: 200,
      potCents: 1000,
      board: ["A♥", "7♠", "2♣"], // Flop gives Hero top pair
    },
    seats: [
      {
        seat: 0,
        occupied: true,
        userId: "hero-user",
        isBot: false,
        name: "Hero",
        status: "ACTIVE",
        stackCents: 1800,
        roundBetCents: 0,
        committedCents: 200,
        connected: true,
        disconnectDeadlineTs: 0,
        isDealer: false,
        isToAct: true,
      },
      {
        seat: 1,
        occupied: true,
        userId: "opponent-caller",
        isBot: false,
        name: "Caller",
        status: "ACTIVE",
        stackCents: 1600,
        roundBetCents: 0,
        committedCents: 400,
        connected: true,
        disconnectDeadlineTs: 0,
        isDealer: true,
        isToAct: false,
      },
      {
        seat: 2,
        occupied: false,
        isBot: false,
        name: "",
        status: "OUT",
        stackCents: 0,
        roundBetCents: 0,
        committedCents: 0,
        connected: false,
        disconnectDeadlineTs: 0,
        isDealer: false,
        isToAct: false,
      },
      {
        seat: 3,
        occupied: false,
        isBot: false,
        name: "",
        status: "OUT",
        stackCents: 0,
        roundBetCents: 0,
        committedCents: 0,
        connected: false,
        disconnectDeadlineTs: 0,
        isDealer: false,
        isToAct: false,
      },
      {
        seat: 4,
        occupied: false,
        isBot: false,
        name: "",
        status: "OUT",
        stackCents: 0,
        roundBetCents: 0,
        committedCents: 0,
        connected: false,
        disconnectDeadlineTs: 0,
        isDealer: false,
        isToAct: false,
      },
      {
        seat: 5,
        occupied: false,
        isBot: false,
        name: "",
        status: "OUT",
        stackCents: 0,
        roundBetCents: 0,
        committedCents: 0,
        connected: false,
        disconnectDeadlineTs: 0,
        isDealer: false,
        isToAct: false,
      },
    ],
    hero: {
      userId: "hero-user",
      youAreSeated: true,
      seat: 0,
      holeCards: ["A♠", "K♦"],
      actionOptions: {
        canFold: true,
        canCheck: true,
        canCall: false,
        canBet: true,
        canRaise: false,
        canAllIn: false,
        primaryWagerAction: "BET",
        callAmount: 0,
        minRaiseTo: 200,
        maxRaiseTo: 1800,
      },
      calculations: {
        mode: "LIVE_ADVISORY",
        stale: false,
        equityPct: 68, // 68% equity vs calling range
        potOddsPct: 0, // No bet to call
        updatedAtTs: Date.now(),
      },
    },
    lastAction: {
      handId: "lesson-hand-2",
      seq: 2,
      street: "FLOP",
      actorUserId: "opponent-caller",
      actorKind: "HUMAN",
      action: "CALL",
      amountCents: 400,
      potAfterCents: 1000,
      origin: "PLAYER",
      createdAtTs: Date.now(),
    },
    // Note: lesson metadata will be added later when extending TableSnapshotPayload
  };
}
