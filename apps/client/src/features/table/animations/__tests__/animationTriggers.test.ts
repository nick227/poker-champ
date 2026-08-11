import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { resolveAnimation } from "../animationRegistry";
import {
  clearAllPendingTimeouts,
  computePotWinDispatchDelayMs,
  resolveAllInAnimationDecision,
  resolvePotWinAnimationDecision,
  resolveShowdownAnimationDecision,
  resolveWinnerRevealAnimationDecision,
  scheduleSurvivingTimeout,
} from "../animationTriggers";

type SnapshotOverrides = {
  heroId?: string;
  heroSeat?: number;
  lastHandResult?: TableSnapshotPayload["lastHandResult"];
};

function makeSnapshot({
  heroId = "hero",
  heroSeat = 0,
  lastHandResult,
}: SnapshotOverrides = {}): TableSnapshotPayload {
  return {
    version: 1,
    snapshotId: "snap-1",
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
        seat: heroSeat,
        occupied: true,
        userId: heroId,
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
        seat: heroSeat === 0 ? 1 : 0,
        occupied: true,
        userId: "villain",
        name: "Villain",
        stackCents: 2000,
        roundBetCents: 0,
        committedCents: 0,
        connected: true,
        disconnectDeadlineTs: 0,
        isDealer: true,
        status: "ACTIVE",
        isToAct: false,
        isBot: true,
      },
    ],
    hero: {
      userId: heroId,
      youAreSeated: true,
      seat: heroSeat,
    },
    hand: undefined,
    lastHandResult,
  };
}

describe("resolveShowdownAnimationDecision", () => {
  it("returns null when there is no hand result", () => {
    expect(resolveShowdownAnimationDecision(makeSnapshot(), null)).toBeNull();
  });

  it("returns null when the hand ended by fold (LAST_PLAYER), not showdown", () => {
    const snapshot = makeSnapshot({
      lastHandResult: {
        handId: "hand-1",
        reason: "LAST_PLAYER",
        potCents: 500,
        winnerId: "hero",
        payoutsByUserId: { hero: 500 },
      },
    });
    expect(resolveShowdownAnimationDecision(snapshot, null)).toBeNull();
  });

  it("returns null when hero folded before showdown (not in showdownHoleCardsByUserId)", () => {
    const snapshot = makeSnapshot({
      lastHandResult: {
        handId: "hand-1",
        reason: "SHOWDOWN",
        potCents: 500,
        winnerId: "villain",
        payoutsByUserId: { villain: 500 },
        showdownHoleCardsByUserId: { villain: ["As", "Kd"] },
      },
    });
    expect(resolveShowdownAnimationDecision(snapshot, null)).toBeNull();
  });

  it("fires hero-only when hero reached showdown, even when hero loses", () => {
    const snapshot = makeSnapshot({
      lastHandResult: {
        handId: "hand-1",
        reason: "SHOWDOWN",
        potCents: 0,
        winnerId: "villain",
        payoutsByUserId: { villain: 500 },
        showdownHoleCardsByUserId: { hero: ["2c", "3d"], villain: ["As", "Kd"] },
        winningHandDescr: "Pair of Aces",
      },
    });
    const decision = resolveShowdownAnimationDecision(snapshot, null);
    expect(decision).not.toBeNull();
    expect(decision?.handId).toBe("hand-1");
    expect(decision?.request.event).toBe("SHOWDOWN");
    expect(decision?.request.payload?.isHero).toBe(true);
    // The seat-glow companion highlights the hand's actual winner (villain, seat 1) even though
    // the trigger itself is hero-gated — glowing hero's own seat on a loss would be backwards.
    expect(decision?.request.payload?.anchorSeat).toBe(1);
    // Hero lost, so the winner's hand strength must not inflate hero's showdown tier.
    expect(decision?.request.tier).toBe(0);
  });

  it("anchors the seat glow on hero's own seat when hero is the winner", () => {
    const snapshot = makeSnapshot({
      lastHandResult: {
        handId: "hand-1",
        reason: "SHOWDOWN",
        potCents: 500,
        winnerId: "hero",
        payoutsByUserId: { hero: 500 },
        showdownHoleCardsByUserId: { hero: ["As", "Ad"], villain: ["2c", "3d"] },
      },
    });
    const decision = resolveShowdownAnimationDecision(snapshot, null);
    expect(decision?.request.payload?.anchorSeat).toBe(0);
  });

  it("falls back to hero's own seat when winnerId can't be resolved to a seat (e.g. unresolved split pot)", () => {
    const snapshot = makeSnapshot({
      lastHandResult: {
        handId: "hand-1",
        reason: "SHOWDOWN",
        potCents: 500,
        payoutsByUserId: { hero: 250, villain: 250 },
        showdownHoleCardsByUserId: { hero: ["As", "Ad"], villain: ["Ac", "Ah"] },
      },
    });
    const decision = resolveShowdownAnimationDecision(snapshot, null);
    expect(decision?.request.payload?.anchorSeat).toBe(0);
  });

  it("boosts tier using hero's own hand strength when hero wins at showdown", () => {
    const snapshot = makeSnapshot({
      lastHandResult: {
        handId: "hand-2",
        reason: "SHOWDOWN",
        potCents: 0,
        winnerId: "hero",
        payoutsByUserId: { hero: 500 },
        showdownHoleCardsByUserId: { hero: ["As", "Ad"], villain: ["2c", "3d"] },
        winningHandDescr: "Four of a Kind",
      },
    });
    const decision = resolveShowdownAnimationDecision(snapshot, null);
    expect(decision?.request.tier).toBe(4);
  });

  it("dedupes by handId: does not fire again for the same hand", () => {
    const snapshot = makeSnapshot({
      lastHandResult: {
        handId: "hand-1",
        reason: "SHOWDOWN",
        potCents: 500,
        winnerId: "hero",
        payoutsByUserId: { hero: 500 },
        showdownHoleCardsByUserId: { hero: ["As", "Ad"], villain: ["2c", "3d"] },
      },
    });
    expect(resolveShowdownAnimationDecision(snapshot, "hand-1")).toBeNull();
  });

  it("fires again for a new hand after a previous hand already fired", () => {
    const snapshot = makeSnapshot({
      lastHandResult: {
        handId: "hand-2",
        reason: "SHOWDOWN",
        potCents: 500,
        winnerId: "hero",
        payoutsByUserId: { hero: 500 },
        showdownHoleCardsByUserId: { hero: ["As", "Ad"], villain: ["2c", "3d"] },
      },
    });
    expect(resolveShowdownAnimationDecision(snapshot, "hand-1")?.handId).toBe("hand-2");
  });

  it("returns null when hero userId is missing (defensive)", () => {
    const snapshot = makeSnapshot({
      heroId: "",
      lastHandResult: {
        handId: "hand-1",
        reason: "SHOWDOWN",
        potCents: 500,
        payoutsByUserId: {},
        showdownHoleCardsByUserId: {},
      },
    });
    expect(resolveShowdownAnimationDecision(snapshot, null)).toBeNull();
  });
});

describe("computePotWinDispatchDelayMs", () => {
  it("returns 0 when the hand ended by fold (no showdown to sequence after)", () => {
    expect(computePotWinDispatchDelayMs("LAST_PLAYER", 500, undefined)).toBe(0);
    expect(computePotWinDispatchDelayMs(undefined, 500, undefined)).toBe(0);
  });

  it("returns a positive delay covering the resolved SHOWDOWN animation duration when the hand reached showdown", () => {
    const tier = 2;
    const showdownDef = resolveAnimation("SHOWDOWN", tier);
    expect(showdownDef).toBeDefined();
    // potCents=2000, no hand descr -> pot-size-only tier 2 (matches mapShowdownTier math, no boost).
    const delayMs = computePotWinDispatchDelayMs("SHOWDOWN", 2000, undefined);
    expect(delayMs).toBeGreaterThan(showdownDef!.durationMs);
    expect(delayMs).toBe(showdownDef!.durationMs + 80);
  });
});

describe("scheduleSurvivingTimeout / clearAllPendingTimeouts", () => {
  // Regression coverage for a real bug caught during live browser verification: a delayed
  // POT_WIN dispatch (scheduled after a SHOWDOWN reveal) was silently lost whenever the *next*
  // hand's snapshot update landed before the delay elapsed. That happened because the original
  // implementation returned `() => clearTimeout(id)` as the POT_WIN effect's own cleanup — so a
  // dependency change (a new hand starting) cancelled the still-pending celebration for the
  // *previous*, already-won hand. scheduleSurvivingTimeout fixes this by tracking timeouts in a
  // ref that outlives any single effect run; only clearAllPendingTimeouts (called on unmount)
  // cancels them.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires the dispatch after delayMs", () => {
    const pending = new Set<ReturnType<typeof setTimeout>>();
    const dispatch = vi.fn();
    scheduleSurvivingTimeout(pending, 1000, dispatch);
    expect(dispatch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(999);
    expect(dispatch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("removes itself from the pending set once fired (no leak)", () => {
    const pending = new Set<ReturnType<typeof setTimeout>>();
    scheduleSurvivingTimeout(pending, 500, () => {});
    expect(pending.size).toBe(1);
    vi.advanceTimersByTime(500);
    expect(pending.size).toBe(0);
  });

  it("survives an unrelated event that would have cancelled a naive effect-cleanup timeout (the actual bug)", () => {
    const pending = new Set<ReturnType<typeof setTimeout>>();
    const handOneDispatch = vi.fn();

    // Hand 1 reaches showdown and hero wins; POT_WIN is scheduled 1000ms out.
    scheduleSurvivingTimeout(pending, 1000, handOneDispatch);

    // Before that delay elapses, hand 2's snapshot arrives — simulated here as "nothing happens
    // to the already-scheduled timeout," which is exactly the property the old buggy
    // implementation violated (its effect cleanup ran on the dependency change and cancelled it).
    vi.advanceTimersByTime(400);
    expect(handOneDispatch).not.toHaveBeenCalled();

    // Hand 1's celebration must still fire on schedule, unaffected by hand 2 having started.
    vi.advanceTimersByTime(600);
    expect(handOneDispatch).toHaveBeenCalledTimes(1);
  });

  it("clearAllPendingTimeouts cancels everything still pending (unmount path)", () => {
    const pending = new Set<ReturnType<typeof setTimeout>>();
    const dispatch = vi.fn();
    scheduleSurvivingTimeout(pending, 1000, dispatch);
    scheduleSurvivingTimeout(pending, 2000, dispatch);
    expect(pending.size).toBe(2);

    clearAllPendingTimeouts(pending);
    expect(pending.size).toBe(0);

    vi.advanceTimersByTime(5000);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("resolvePotWinAnimationDecision", () => {
  const winnerBanner = { handId: "hand-1", winnerName: "Hero Player", amountCents: 500, winningHandDescr: "Four of a Kind" };
  const lastHandResult: TableSnapshotPayload["lastHandResult"] = {
    handId: "hand-1",
    reason: "LAST_PLAYER",
    potCents: 500,
    winnerId: "hero",
    payoutsByUserId: { hero: 500 },
  };

  it("returns null when there is no winner banner", () => {
    expect(resolvePotWinAnimationDecision(null, lastHandResult, true, 0, null)).toBeNull();
  });

  it("returns null when there is no hand result", () => {
    expect(resolvePotWinAnimationDecision(winnerBanner, undefined, true, 0, null)).toBeNull();
  });

  it("returns null when hero did not win (opponent-win background events don't get the hero-voiced celebration)", () => {
    expect(resolvePotWinAnimationDecision(winnerBanner, lastHandResult, false, 0, null)).toBeNull();
  });

  it("dedupes by handId: does not fire again for the same hand", () => {
    expect(resolvePotWinAnimationDecision(winnerBanner, lastHandResult, true, 0, "hand-1")).toBeNull();
  });

  it("builds a hero-voiced POT_WIN request with tier from pot size + hand strength, no delay when the hand ended by fold", () => {
    const decision = resolvePotWinAnimationDecision(winnerBanner, lastHandResult, true, 3, null);
    expect(decision).not.toBeNull();
    expect(decision?.handId).toBe("hand-1");
    expect(decision?.delayMs).toBe(0);
    expect(decision?.request.event).toBe("POT_WIN");
    expect(decision?.request.payload?.headline).toBe("YOU WIN");
    expect(decision?.request.payload?.amountCents).toBe(500);
    expect(decision?.request.payload?.winnerSeat).toBe(3);
    expect(decision?.request.payload?.isHero).toBe(true);
    // potCents=500 -> tier 1, "four of a kind" boosts +4, clamped to 4.
    expect(decision?.request.tier).toBe(4);
  });

  it("computes a positive delay (matching computePotWinDispatchDelayMs) when the hand reached showdown", () => {
    const showdownResult: TableSnapshotPayload["lastHandResult"] = { ...lastHandResult, reason: "SHOWDOWN" };
    const decision = resolvePotWinAnimationDecision(winnerBanner, showdownResult, true, 0, null);
    const expectedDelay = computePotWinDispatchDelayMs("SHOWDOWN", 500, "Four of a Kind");
    expect(decision?.delayMs).toBe(expectedDelay);
    expect(decision?.delayMs).toBeGreaterThan(0);
  });
});

describe("resolveAllInAnimationDecision", () => {
  const lastAction: TableSnapshotPayload["lastAction"] = {
    handId: "hand-1",
    seq: 3,
    street: "PREFLOP",
    actorUserId: "hero",
    actorKind: "HUMAN",
    action: "ALL_IN",
    amountCents: 2000,
    potAfterCents: 2500,
    origin: "PLAYER",
    createdAtTs: Date.now(),
  };

  it("returns null when the last action isn't ALL_IN", () => {
    expect(resolveAllInAnimationDecision({ ...lastAction, action: "RAISE" }, "hero", 0, 500, null)).toBeNull();
  });

  it("returns null when the all-in actor isn't hero (opponent shoves don't get the hero-voiced fx)", () => {
    expect(resolveAllInAnimationDecision({ ...lastAction, actorUserId: "villain" }, "hero", 0, 500, null)).toBeNull();
  });

  it("returns null when heroUserId is missing (defensive)", () => {
    expect(resolveAllInAnimationDecision(lastAction, undefined, 0, 500, null)).toBeNull();
  });

  it("dedupes by handId:seq, not by handId alone", () => {
    expect(resolveAllInAnimationDecision(lastAction, "hero", 0, 500, "hand-1:3")).toBeNull();
    // A later all-in action in the same hand (different seq) still fires.
    const decision = resolveAllInAnimationDecision(lastAction, "hero", 0, 500, "hand-1:2");
    expect(decision).not.toBeNull();
    expect(decision?.key).toBe("hand-1:3");
  });

  it("builds a hero-voiced ALL_IN request with tier from pot size + bet size", () => {
    const decision = resolveAllInAnimationDecision(lastAction, "hero", 5, 100000, null);
    expect(decision).not.toBeNull();
    expect(decision?.request.event).toBe("ALL_IN");
    expect(decision?.request.payload?.headline).toBe("ALL IN");
    expect(decision?.request.payload?.amountCents).toBe(2000);
    expect(decision?.request.payload?.anchorSeat).toBe(5);
    expect(decision?.request.payload?.isHero).toBe(true);
    // potCents=100000 -> pot-size tier 4, plus amountCents=2000 < 5000 big-bet threshold -> no boost.
    expect(decision?.request.tier).toBe(4);
  });
});

describe("resolveWinnerRevealAnimationDecision", () => {
  const heroWinBanner = { handId: "hand-1", winnerName: "Hero Player", amountCents: 500, winningHandDescr: "Two Pair" };
  const opponentWinBanner = { handId: "hand-1", winnerName: "Villain", amountCents: 500, winningHandDescr: "Two Pair" };

  it("returns null when there is no winner banner or no hand result", () => {
    const foldOutSnapshot = makeSnapshot({
      lastHandResult: { handId: "hand-1", reason: "LAST_PLAYER", potCents: 500, winnerId: "hero", payoutsByUserId: { hero: 500 } },
    });
    expect(resolveWinnerRevealAnimationDecision(foldOutSnapshot, null, true, null)).toBeNull();
    expect(resolveWinnerRevealAnimationDecision(makeSnapshot(), heroWinBanner, true, null)).toBeNull();
  });

  it("dedupes by handId: does not fire again for the same hand", () => {
    const snapshot = makeSnapshot({
      lastHandResult: { handId: "hand-1", reason: "LAST_PLAYER", potCents: 500, winnerId: "hero", payoutsByUserId: { hero: 500 } },
    });
    expect(resolveWinnerRevealAnimationDecision(snapshot, heroWinBanner, true, "hand-1")).toBeNull();
  });

  it("returns null for an opponent win at showdown hero reached: SEAT_GLOW_SHOWDOWN already covers it", () => {
    // Without this exclusion, this fires undelayed at essentially the same moment as SHOWDOWN's
    // own seat-glow companion and loses the race for the shared SEAT channel every time (see the
    // function's doc comment) — so it must not even try.
    const snapshot = makeSnapshot({
      heroSeat: 0,
      lastHandResult: {
        handId: "hand-1",
        reason: "SHOWDOWN",
        potCents: 500,
        winnerId: "villain",
        payoutsByUserId: { villain: 500 },
        showdownHoleCardsByUserId: { hero: ["2c", "3d"], villain: ["As", "Kd"] },
      },
    });
    expect(resolveWinnerRevealAnimationDecision(snapshot, opponentWinBanner, false, null)).toBeNull();
  });

  it("still fires, anchored to the winner's seat, for a background showdown hero wasn't part of", () => {
    // No showdownHoleCardsByUserId entry for hero -> resolveShowdownAnimationDecision's own gate
    // also returns null for this hand, so SHOWDOWN's companion never claims the SEAT channel and
    // there's nothing for this to collide with.
    const snapshot = makeSnapshot({
      heroSeat: 0,
      lastHandResult: {
        handId: "hand-1",
        reason: "SHOWDOWN",
        potCents: 500,
        winnerId: "villain",
        payoutsByUserId: { villain: 500 },
        showdownHoleCardsByUserId: { villain: ["As", "Kd"], someoneElse: ["2c", "3d"] },
      },
    });
    const decision = resolveWinnerRevealAnimationDecision(snapshot, opponentWinBanner, false, null);
    expect(decision).not.toBeNull();
    expect(decision?.delayMs).toBe(0);
    expect(decision?.request.event).toBe("WINNER_REVEAL");
    expect(decision?.request.tier).toBe(0);
    // Villain sits at seat 1 in makeSnapshot's fixture (hero defaults to seat 0).
    expect(decision?.request.payload?.anchorSeat).toBe(1);
  });

  it("dispatches immediately (no delay), anchored to hero's seat, for a hero win by fold-out", () => {
    const snapshot = makeSnapshot({
      heroSeat: 0,
      lastHandResult: { handId: "hand-1", reason: "LAST_PLAYER", potCents: 500, winnerId: "hero", payoutsByUserId: { hero: 500 } },
    });
    const decision = resolveWinnerRevealAnimationDecision(snapshot, heroWinBanner, true, null);
    expect(decision).not.toBeNull();
    expect(decision?.delayMs).toBe(0);
    expect(decision?.request.payload?.anchorSeat).toBe(0);
  });

  it("delays dispatch (matching computePotWinDispatchDelayMs), not suppressed, for a hero win at showdown", () => {
    const snapshot = makeSnapshot({
      heroSeat: 0,
      lastHandResult: {
        handId: "hand-1",
        reason: "SHOWDOWN",
        potCents: 500,
        winnerId: "hero",
        payoutsByUserId: { hero: 500 },
        showdownHoleCardsByUserId: { hero: ["As", "Ad"], villain: ["2c", "3d"] },
      },
    });
    const decision = resolveWinnerRevealAnimationDecision(snapshot, heroWinBanner, true, null);
    const expectedDelay = computePotWinDispatchDelayMs("SHOWDOWN", 500, "Two Pair");
    expect(decision?.delayMs).toBe(expectedDelay);
    expect(decision?.delayMs).toBeGreaterThan(0);
    expect(decision?.request.payload?.anchorSeat).toBe(0);
  });

  it("fires again for a new hand after a previous hand already resolved", () => {
    const snapshot = makeSnapshot({
      lastHandResult: { handId: "hand-2", reason: "LAST_PLAYER", potCents: 500, winnerId: "hero", payoutsByUserId: { hero: 500 } },
    });
    const decision = resolveWinnerRevealAnimationDecision(snapshot, heroWinBanner, true, "hand-1");
    expect(decision?.handId).toBe("hand-2");
  });
});
