import type { PokerState } from "../../state/PokerState.js";
import { bettingRoundComplete, eligibleForShowdown, eligibleToAct, noFurtherBettingPossible } from "../rules/BettingRound.js";
import { countNotFoldedPlayers } from "../dealer/utils/TableNavigator.js";

function fail(message: string): never {
  throw new Error(`STATE_INVARIANT_VIOLATION: ${message}`);
}

export function assertStateInvariants(state: PokerState): void {
  if (state.potCents < 0) fail("potCents is negative");
  if (state.roundCurrentBetCents < 0) fail("roundCurrentBetCents is negative");
  if (state.minRaiseCents < 0) fail("minRaiseCents is negative");
  if (state.actionCount < 0) fail("actionCount is negative");

  let maxRoundBet = 0;
  let maxRoundBetActiveOrAllIn = 0;
  let committedSum = 0;
  let actionablePlayers = 0;
  let needsActionPlayers = 0;
  let showdownEligiblePlayers = 0;

  for (const [playerId, player] of state.playersById.entries()) {
    if (player.stackCents < 0) fail(`negative stack for ${playerId}`);
    if (player.roundBetCents < 0) fail(`negative roundBetCents for ${playerId}`);
    if (player.committedCents < 0) fail(`negative committedCents for ${playerId}`);
    if (player.roundBetCents > player.committedCents) {
      fail(`roundBetCents exceeds committedCents for ${playerId}`);
    }

    if (player.status !== "ACTIVE" && player.needsAction) {
      fail(`non-ACTIVE player has needsAction=true for ${playerId}`);
    }
    if (eligibleToAct(player)) {
      actionablePlayers += 1;
      if (player.needsAction) needsActionPlayers += 1;
      // Note: roundBetCents < roundCurrentBetCents with needsAction=false is valid when a short all-in did not reopen (doc §9.8).
    }

    if (player.seat < 0 || player.seat >= state.seats.length) {
      fail(`invalid seat index on player ${playerId}`);
    }
    if (state.seats[player.seat] !== playerId) {
      fail(`seat map mismatch for ${playerId}`);
    }

    maxRoundBet = Math.max(maxRoundBet, player.roundBetCents);
    if (eligibleForShowdown(player)) {
      showdownEligiblePlayers += 1;
      maxRoundBetActiveOrAllIn = Math.max(maxRoundBetActiveOrAllIn, player.roundBetCents);
    }
    committedSum += player.committedCents;
  }

  for (let seat = 0; seat < state.seats.length; seat++) {
    const occupant = state.seats[seat];
    if (!occupant) continue;
    const player = state.playersById.get(occupant);
    if (!player) fail(`seat ${seat} references missing player ${occupant}`);
    if (player.seat !== seat) fail(`seat index mismatch for ${occupant}`);
  }

  if (state.roundCurrentBetCents > maxRoundBet) {
    fail("roundCurrentBetCents exceeds max roundBetCents");
  }
  if (state.street !== "WAITING" && state.roundCurrentBetCents > 0 && state.roundCurrentBetCents !== maxRoundBetActiveOrAllIn) {
    fail("roundCurrentBetCents must equal max(roundBetCents) over ACTIVE and ALL_IN");
  }

  if (state.potCents < committedSum) {
    fail("potCents is less than total committedCents");
  }

  if (
    state.street !== "WAITING" &&
    state.street !== "SHOWDOWN" &&
    state.roundState === "HAND_COMPLETE" &&
    showdownEligiblePlayers > 1
  ) {
    fail("action street with roundState=HAND_COMPLETE must already be terminal");
  }

  if (state.runoutMode === "STAGED" && needsActionPlayers > 0) {
    fail("runoutMode=STAGED cannot have players with needsAction=true");
  }

  if (
    state.street !== "WAITING" &&
    countNotFoldedPlayers(state) > 1 &&
    actionablePlayers > 0 &&
    !bettingRoundComplete(state) &&
    !noFurtherBettingPossible(state) &&
    needsActionPlayers === 0
  ) {
    fail("active hand has no eligible player marked needsAction");
  }
}

export function maybeAssertStateInvariants(state: PokerState): void {
  if (process.env.NODE_ENV === "production") return;
  assertStateInvariants(state);
}
