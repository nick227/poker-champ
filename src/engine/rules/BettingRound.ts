import type { PokerState } from "../../state/PokerState.js";
import type { PlayerState } from "../../state/PlayerState.js";

export function eligibleToAct(p: PlayerState): boolean {
  return p.status === "ACTIVE";
}

export function eligibleForShowdown(p: PlayerState): boolean {
  return p.status === "ACTIVE" || p.status === "ALL_IN";
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
    if (!eligibleToAct(p)) {
      p.needsAction = false;
      continue;
    }
    p.needsAction = (p.id !== actorId);
  }
}

/**
 * Round begins: players who can act must act at least once, except those who are already all-in/folded/out.
 */
export function beginRound(state: PokerState) {
  for (const p of state.playersById.values()) {
    p.needsAction = eligibleToAct(p);
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
    if (!eligibleToAct(p)) continue;
    if (p.roundBetCents !== state.roundCurrentBetCents) return false;
  }
  return true;
}

/**
 * Determine if no further betting is possible because all remaining players are all-in or folded.
 */
export function noFurtherBettingPossible(state: PokerState): boolean {
  const live = [...state.playersById.values()].filter(p => p.status !== "OUT");
  const contenders = live.filter(p => p.status !== "FOLDED" && p.status !== "ABANDONED");
  const active = contenders.filter(p => p.status === "ACTIVE");
  // If nobody is ACTIVE, then everyone left is ALL_IN => no further actions.
  return active.length === 0 && contenders.length >= 1;
}
