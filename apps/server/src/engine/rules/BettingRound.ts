import type { PokerState } from "../../state/PokerState.js";
import type { PlayerState } from "../../state/PlayerState.js";

export function eligibleToAct(p: PlayerState): boolean {
  return p.status === "ACTIVE";
}

export function eligibleForShowdown(p: PlayerState): boolean {
  return p.status === "ACTIVE" || p.status === "ALL_IN";
}

function isSeatSchedulable(state: PokerState, p: PlayerState): boolean {
  return p.seat >= 0 && p.seat < state.seats.length && state.seats[p.seat] === p.id;
}

export function resetBettingRound(state: PokerState) {
  state.roundCurrentBetCents = 0;
  state.minRaiseCents = state.bigBlindCents;
  for (const p of state.playersById.values()) {
    p.roundBetCents = 0;
    p.hasActedThisStreet = false;
    // needsAction set when round begins
  }
}

/** Whether an ACTIVE seated player still owes a decision this street. */
export function computePlayerNeedsAction(state: PokerState, p: PlayerState): boolean {
  if (!eligibleToAct(p) || !isSeatSchedulable(state, p)) return false;
  if (!p.hasActedThisStreet) return true;
  return p.roundBetCents < state.roundCurrentBetCents;
}

export function syncAllPlayerNeedsAction(state: PokerState): void {
  for (const p of state.playersById.values()) {
    p.needsAction = computePlayerNeedsAction(state, p);
  }
}

/**
 * Mark that a new bet level has been set (bet/raise).
 * Everyone else who can act must respond again.
 */
export function onNewBetLevel(state: PokerState, actorId: string) {
  for (const p of state.playersById.values()) {
    if (!eligibleToAct(p) || !isSeatSchedulable(state, p)) {
      p.needsAction = false;
      continue;
    }
    if (p.id !== actorId) {
      p.hasActedThisStreet = false;
      p.needsAction = true;
    }
  }
}

/**
 * After a fold (or any change that removes an ACTIVE/ALL_IN), set roundCurrentBetCents to the
 * max roundBetCents over remaining ACTIVE and ALL_IN so the state invariant holds.
 */
export function syncRoundCurrentBetCents(state: PokerState): void {
  let max = 0;
  for (const p of state.playersById.values()) {
    if (eligibleForShowdown(p)) max = Math.max(max, p.roundBetCents);
  }
  state.roundCurrentBetCents = max;
}

/**
 * Round begins: players who can act must act at least once, except those who are already all-in/folded/out.
 */
export function beginRound(state: PokerState) {
  for (const p of state.playersById.values()) {
    p.hasActedThisStreet = false;
    p.needsAction = eligibleToAct(p) && isSeatSchedulable(state, p);
  }
}

/**
 * A player has completed their obligation for the current bet level.
 */
export function clearPlayerNeedsAction(p: PlayerState) {
  p.needsAction = false;
}

/** Record a betting action this street (blind posts must not call this). */
export function markPlayerActed(p: PlayerState): void {
  p.hasActedThisStreet = true;
  clearPlayerNeedsAction(p);
}

/**
 * A betting round is complete once every eligible (ACTIVE, schedulable) player both
 * (a) no longer owes an explicit decision (`needsAction === false`) and (b) has fully
 * matched the current bet level (`roundBetCents === state.roundCurrentBetCents`).
 *
 * `needsAction` is the canonical "owes a decision" flag — kept in sync by
 * beginRound/markPlayerActed/onNewBetLevel — and it alone decides (a): it correctly
 * captures nuances a naive `hasActedThisStreet` check cannot, in particular the BB-option
 * rule (a player who already matches roundCurrentBetCents but has never acted this street
 * still owes a decision; beginRound/onNewBetLevel keep needsAction=true for them precisely
 * because hasActedThisStreet is false, so re-checking hasActedThisStreet here independently
 * is redundant with — and can spuriously disagree with — needsAction). It also correctly
 * reflects a fold that lowers roundCurrentBetCents (via syncRoundCurrentBetCents) and
 * thereby retroactively satisfies another player's outstanding call: that player's
 * needsAction was already correctly false and must not be second-guessed via
 * hasActedThisStreet.
 *
 * The roundBetCents equality check (b) is kept as an independent, unconditional guard
 * against a different, more dangerous bug class: an ACTIVE player whose needsAction was
 * wrongly cleared (e.g. a reconnection bug that flips a player back to ACTIVE without
 * re-arming needsAction) while they still owe real money. Production code has no
 * legitimate path that clears an ACTIVE player's needsAction while they are genuinely
 * short of the current bet EXCEPT the short-all-in-doesn't-reopen carve-out (doc §9.8),
 * which always coincides with an ALL_IN contender — that carve-out is intentionally
 * handled only by noFurtherBettingPossible (scoped to allIn.length >= 1), not here.
 */
export function bettingRoundComplete(state: PokerState): boolean {
  for (const p of state.playersById.values()) {
    if (!eligibleToAct(p) || !isSeatSchedulable(state, p)) continue;
    if (p.needsAction) return false;
    if (p.roundBetCents !== state.roundCurrentBetCents) return false;
  }
  return true;
}

/**
 * Determine if no further betting is possible because all remaining players are all-in or folded.
 */
export function noFurtherBettingPossible(state: PokerState): boolean {
  const live = [...state.playersById.values()].filter((p) => p.status !== "OUT" && isSeatSchedulable(state, p));
  const contenders = live.filter(p => p.status !== "FOLDED" && p.status !== "ABANDONED");
  const active = contenders.filter(p => p.status === "ACTIVE");
  const allIn = contenders.filter(p => p.status === "ALL_IN");
  // If nobody is ACTIVE, everyone left is all-in/final.
  if (active.length === 0 && contenders.length >= 1) return true;
  // If exactly one player can still act and at least one contender is all-in,
  // no further betting is possible only once the active player has no pending action.
  // needsAction is the canonical "owes a decision" flag (see bettingRoundComplete doc);
  // it already accounts for hasActedThisStreet and roundBetCents, so re-checking those
  // fields independently here can only disagree with it incorrectly.
  if (active.length === 1 && allIn.length >= 1) {
    const onlyActive = active[0]!;
    if (!onlyActive.needsAction) return true;
  }
  // Short all-in can increase roundCurrentBetCents without reopening action for players that already acted.
  // If at least one contender is all-in and no ACTIVE player has needsAction, betting is closed.
  if (
    allIn.length >= 1 &&
    active.length >= 1 &&
    active.every((p) => !p.needsAction)
  ) {
    return true;
  }
  return false;
}

/**
 * True when every remaining contender is all-in (or no longer able to bet).
 * This is the canonical "board runout only" trigger.
 */
export function allRemainingPlayersAllInOrFolded(state: PokerState): boolean {
  const contenders = [...state.playersById.values()].filter(
    (p) => p.status !== "OUT" && p.status !== "FOLDED" && p.status !== "ABANDONED",
  );
  if (contenders.length < 2) return false;
  return contenders.every((p) => p.status === "ALL_IN");
}
