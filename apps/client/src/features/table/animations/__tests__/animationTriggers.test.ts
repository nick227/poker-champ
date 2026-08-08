import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { resolveAnimation } from "../animationRegistry";
import {
  clearAllPendingTimeouts,
  computePotWinDispatchDelayMs,
  resolveShowdownAnimationDecision,
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
    expect(decision?.request.payload?.anchorSeat).toBe(0);
    // Hero lost, so the winner's hand strength must not inflate hero's showdown tier.
    expect(decision?.request.tier).toBe(0);
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
