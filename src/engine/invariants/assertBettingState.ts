import type { PokerState } from "../../state/PokerState.js";
import { bettingRoundComplete, eligibleToAct, noFurtherBettingPossible } from "../rules/BettingRound.js";

function fail(message: string): never {
  throw new Error(`BETTING_INVARIANT_VIOLATION: ${message}`);
}

function assertRoundCurrentBetMatchesMax(state: PokerState): void {
  let maxRoundBet = 0;
  for (const player of state.playersById.values()) {
    maxRoundBet = Math.max(maxRoundBet, player.roundBetCents);
  }
  if (state.roundCurrentBetCents !== maxRoundBet) {
    fail(`roundCurrentBetCents (${state.roundCurrentBetCents}) must equal max roundBetCents (${maxRoundBet})`);
  }
}

function assertNoNegativeStacks(state: PokerState): void {
  for (const [playerId, player] of state.playersById.entries()) {
    if (player.stackCents < 0) {
      fail(`negative stack for ${playerId}`);
    }
  }
}

function assertRunoutNeedsActionInvariant(state: PokerState): void {
  if (state.runoutMode !== "STAGED") return;
  for (const [playerId, player] of state.playersById.entries()) {
    if (player.needsAction) {
      fail(`runoutMode=STAGED cannot have needsAction=true (${playerId})`);
    }
  }
}

function assertToActOrRoundComplete(state: PokerState): void {
  if (state.street === "WAITING" || state.runoutMode === "STAGED") return;
  if (bettingRoundComplete(state) || noFurtherBettingPossible(state)) return;

  const toActId = state.seats[state.toActSeat] ?? "";
  const toAct = toActId ? state.playersById.get(toActId) : undefined;
  if (!toAct) fail("open betting round requires valid toActSeat");
  if (!eligibleToAct(toAct)) fail("toActSeat must reference an eligible ACTIVE player");
  if (!toAct.needsAction) fail("toActSeat player must have needsAction=true");

  const hasAnyNeedsAction = [...state.playersById.values()].some((player) => eligibleToAct(player) && player.needsAction);
  if (!hasAnyNeedsAction) {
    fail("open betting round requires at least one eligible player with needsAction=true");
  }
}

export function assertBettingState(state: PokerState): void {
  if (state.street === "WAITING") {
    assertNoNegativeStacks(state);
    assertRunoutNeedsActionInvariant(state);
    return;
  }
  assertNoNegativeStacks(state);
  assertRoundCurrentBetMatchesMax(state);
  assertRunoutNeedsActionInvariant(state);
  assertToActOrRoundComplete(state);
}

export function maybeAssertBettingState(state: PokerState): void {
  if (process.env.NODE_ENV === "production") return;
  assertBettingState(state);
}

