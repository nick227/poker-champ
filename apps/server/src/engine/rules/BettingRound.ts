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
    // needsAction set when round begins
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
    p.needsAction = (p.id !== actorId);
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
    p.needsAction = eligibleToAct(p) && isSeatSchedulable(state, p);
  }
}

/**
 * A player has completed their obligation for the current bet level.
 */
export function clearPlayerNeedsAction(p: PlayerState) {
  p.needsAction = false;
}

export function bettingRoundComplete(state: PokerState): boolean {
  for (const p of state.playersById.values()) {
    if (p.needsAction) return false;
  }
  // also ensure all ACTIVE players have matched current bet (or have 0 stack due to all-in handled elsewhere)
  for (const p of state.playersById.values()) {
    if (!eligibleToAct(p) || !isSeatSchedulable(state, p)) continue;
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
  // no further betting is possible only once the active player has no pending action
  // and has matched the current level.
  if (active.length === 1 && allIn.length >= 1) {
    const onlyActive = active[0]!;
    const hasPendingDecision = onlyActive.needsAction || onlyActive.roundBetCents < state.roundCurrentBetCents;
    if (!hasPendingDecision) return true;
  }
  // Short all-in can increase roundCurrentBetCents without reopening action for players that already acted.
  // If at least one contender is all-in and no ACTIVE player has needsAction, betting is closed.
  if (allIn.length >= 1 && active.length >= 1 && active.every((p) => !p.needsAction)) {
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
