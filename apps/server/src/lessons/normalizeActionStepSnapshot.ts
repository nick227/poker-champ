/**
 * Normalize an ACTION_STEP snapshot so it is fully renderable (wager bounds set, version set).
 * Seed pipeline uses this before writing snapshotJson; client skips repair when version >= canonical.
 */

import type { TableSnapshotPayload, HeroActionOptions } from "@poker-champ/realtime-contract";
import { CANONICAL_LESSON_SNAPSHOT_VERSION } from "@poker-champ/realtime-contract";

export type NormalizeContext = { lessonId?: string; stepId?: string };

function msg(context: NormalizeContext, what: string): string {
  const parts = [what];
  if (context.lessonId) parts.push(`lessonId=${context.lessonId}`);
  if (context.stepId) parts.push(`stepId=${context.stepId}`);
  return parts.join(" ");
}

function getHeroStackAndRoundBet(snapshot: TableSnapshotPayload): { stackCents: number; roundBetCents: number } {
  const heroSeat = snapshot.hero?.seat;
  if (heroSeat == null) return { stackCents: 0, roundBetCents: 0 };
  const seat = snapshot.seats?.find((s) => s.seat === heroSeat);
  return {
    stackCents: seat?.stackCents ?? 0,
    roundBetCents: seat?.roundBetCents ?? 0,
  };
}

function deriveWagerBounds(
  actionOptions: HeroActionOptions,
  snapshot: TableSnapshotPayload,
  heroStackCents: number,
  heroRoundBetCents: number,
): { minRaiseTo: number; maxRaiseTo: number } | null {
  const hand = snapshot.hand;
  const table = snapshot.table;
  if (!hand) return null;
  const roundCurrentBetCents = hand.roundCurrentBetCents ?? 0;
  const minRaiseCents = hand.minRaiseCents ?? 0;
  const bigBlindCents = table?.bigBlindCents ?? 100;
  const primary = actionOptions.primaryWagerAction;
  const needBet = primary === "BET" && actionOptions.canBet;
  const needRaise = primary === "RAISE" && actionOptions.canRaise;
  if (!needBet && !needRaise) return null;

  let minRaiseTo: number;
  let maxRaiseTo: number;
  if (primary === "BET" && actionOptions.canBet) {
    minRaiseTo = bigBlindCents;
    maxRaiseTo = heroStackCents;
  } else {
    minRaiseTo = roundCurrentBetCents + minRaiseCents;
    maxRaiseTo = heroRoundBetCents + heroStackCents;
  }
  if (minRaiseTo <= 0 || maxRaiseTo < minRaiseTo) return null;
  return { minRaiseTo, maxRaiseTo };
}

/**
 * Normalize ACTION_STEP snapshot: ensure hero is to act, actionOptions exists, wager bounds set when needed, version set.
 * For version >= CANONICAL_LESSON_SNAPSHOT_VERSION: validate only, require derived fields (minRaiseTo/maxRaiseTo) when
 * expected is BET/RAISE; do not mutate. Throws with a clear message (including context) if any invariant fails.
 */
export function normalizeActionStepSnapshot(
  snapshot: TableSnapshotPayload,
  expectedAction: string,
  context: NormalizeContext = {},
): TableSnapshotPayload {
  const hand = snapshot.hand;
  const heroSeat = snapshot.hero?.seat;
  const toActSeat = hand?.toActSeat;

  if (!hand) throw new Error(msg(context, "Invariant failed: snapshot.hand is missing."));
  if (heroSeat == null) throw new Error(msg(context, "Invariant failed: snapshot.hero.seat is missing."));
  if (toActSeat !== heroSeat) {
    throw new Error(msg(context, `Invariant failed: hero must be to act (hand.toActSeat=${toActSeat}, hero.seat=${heroSeat}).`));
  }

  let actionOptions = snapshot.hero?.actionOptions;
  if (!actionOptions) throw new Error(msg(context, "Invariant failed: hero.actionOptions is missing."));

  const u = expectedAction.toUpperCase();
  const needsWager = u === "BET" || u === "RAISE";
  const isCanonical = (snapshot.lessonSnapshotVersion ?? 0) >= CANONICAL_LESSON_SNAPSHOT_VERSION;

  if (needsWager) {
    if (isCanonical) {
      const minRaiseTo = actionOptions.minRaiseTo;
      const maxRaiseTo = actionOptions.maxRaiseTo;
      if (minRaiseTo == null || maxRaiseTo == null) {
        throw new Error(msg(context, "Canonical snapshot (version >= 2) must have hero.actionOptions.minRaiseTo and maxRaiseTo for expected BET/RAISE."));
      }
      if (minRaiseTo <= 0 || maxRaiseTo < minRaiseTo) {
        throw new Error(msg(context, `Canonical snapshot: invalid wager bounds (minRaiseTo=${minRaiseTo}, maxRaiseTo=${maxRaiseTo}).`));
      }
    } else {
      const { stackCents, roundBetCents } = getHeroStackAndRoundBet(snapshot);
      const bounds = deriveWagerBounds(actionOptions, snapshot, stackCents, roundBetCents);
      if (!bounds) {
        throw new Error(msg(context, "Invariant failed: cannot derive valid wager bounds for expected BET/RAISE."));
      }
      if (bounds.minRaiseTo <= 0 || bounds.maxRaiseTo < bounds.minRaiseTo) {
        throw new Error(msg(context, `Invariant failed: invalid wager bounds (minRaiseTo=${bounds.minRaiseTo}, maxRaiseTo=${bounds.maxRaiseTo}).`));
      }
      actionOptions = { ...actionOptions, minRaiseTo: bounds.minRaiseTo, maxRaiseTo: bounds.maxRaiseTo };
    }
  }

  const expectedPossible =
    (u === "FOLD" && actionOptions.canFold) ||
    (u === "CHECK" && actionOptions.canCheck) ||
    (u === "CALL" && actionOptions.canCall) ||
    (u === "BET" && actionOptions.canBet) ||
    (u === "RAISE" && actionOptions.canRaise) ||
    (u === "ALL_IN" && actionOptions.canAllIn);
  if (!expectedPossible) {
    throw new Error(msg(context, `Invariant failed: expected action ${expectedAction} is not possible from snapshot (can* flags).`));
  }

  if (isCanonical) return snapshot;

  return {
    ...snapshot,
    lessonSnapshotVersion: CANONICAL_LESSON_SNAPSHOT_VERSION,
    hero: {
      ...snapshot.hero,
      actionOptions,
    },
  };
}

/**
 * Validate an ACTION_STEP snapshot against invariants without mutating the original.
 * Reuses normalizeActionStepSnapshot and discards the normalized result.
 */
export function validateActionStepSnapshot(
  snapshot: TableSnapshotPayload,
  expectedAction: string,
  context: NormalizeContext = {},
): void {
  // Will throw if invariants fail; caller ignores returned snapshot to avoid mutation.
  void normalizeActionStepSnapshot(snapshot, expectedAction, context);
}

/**
 * Return the set of action types that are actually reachable from the snapshot (matches client getActionContext).
 * BET/RAISE are only included when wager bounds are present and valid.
 */
export function getAllowedActions(snapshot: TableSnapshotPayload): Set<string> {
  const opts = snapshot.hero?.actionOptions;
  const allowed = new Set<string>();
  if (!opts) return allowed;
  if (opts.canFold) allowed.add("FOLD");
  if (opts.canCheck) allowed.add("CHECK");
  if (opts.canCall) allowed.add("CALL");
  if (opts.canAllIn) allowed.add("ALL_IN");
  const hasWagerBounds =
    opts.minRaiseTo != null &&
    opts.maxRaiseTo != null &&
    opts.minRaiseTo > 0 &&
    opts.maxRaiseTo >= opts.minRaiseTo;
  if (opts.canBet && hasWagerBounds) allowed.add("BET");
  if (opts.canRaise && hasWagerBounds) allowed.add("RAISE");
  return allowed;
}

