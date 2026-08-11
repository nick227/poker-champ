import { eligibleToAct } from "../../rules/BettingRound.js";
import type { PokerState } from "../../../state/PokerState.js";
import type { PlayerState } from "../../../state/PlayerState.js";

export function findOpenSeat(state: PokerState): number {
  for (let i = 0; i < state.seats.length; i++) {
    if (!state.seats[i]) return i;
  }
  return -1;
}

export function findNextOccupiedSeat(state: PokerState, fromSeat: number): number | null {
  const n = state.seats.length;
  for (let i = 1; i <= n; i++) {
    const seat = (fromSeat + i) % n;
    if (state.seats[seat]) return seat;
  }
  return null;
}

export function findNextActiveSeat(state: PokerState, fromSeat: number): number | null {
  const n = state.seats.length;
  for (let i = 1; i <= n; i++) {
    const seat = (fromSeat + i) % n;
    const id = state.seats[seat];
    if (!id) continue;

    const player = state.playersById.get(id);
    if (!player) continue;
    if (player.status === "ACTIVE" && player.stackCents > 0) return seat;
  }
  return null;
}

export function findNextToActSeat(state: PokerState, fromSeat: number): number {
  const n = state.seats.length;
  for (let i = 1; i <= n; i++) {
    const seat = (fromSeat + i) % n;
    const id = state.seats[seat];
    if (!id) continue;

    const player = state.playersById.get(id);
    if (!player) continue;
    if (eligibleToAct(player) && player.needsAction) return seat;
  }
  return -1;
}

export function* iterPlayersInSeatOrder(state: PokerState): Generator<PlayerState> {
  for (let i = 0; i < state.seats.length; i++) {
    const id = state.seats[i];
    if (!id) continue;

    const player = state.playersById.get(id);
    if (player) yield player;
  }
}

export function seatOrderLeftOfDealer(state: PokerState): string[] {
  const order: string[] = [];
  const n = state.seats.length;

  for (let i = 1; i <= n; i++) {
    const seat = (state.dealerSeat + i) % n;
    const id = state.seats[seat];
    if (!id) continue;

    const player = state.playersById.get(id);
    if (player && (player.status === "ACTIVE" || player.status === "ALL_IN")) order.push(id);
  }

  return order;
}

export function countNonOutPlayers(state: PokerState): number {
  let count = 0;
  for (const player of state.playersById.values()) {
    if (player.status !== "OUT") count++;
  }
  return count;
}

export function countHumanPlayers(state: PokerState): number {
  let count = 0;
  for (const player of state.playersById.values()) {
    if (player.kind === "HUMAN" && player.status !== "OUT") count++;
  }
  return count;
}

/** Humans who will be dealt in (ACTIVE, not sitting out, have chips). Prevents bot-only hands. */
export function countActiveHumanPlayers(state: PokerState): number {
  let count = 0;
  for (const player of state.playersById.values()) {
    if (player.kind !== "HUMAN") continue;
    if (player.status === "OUT" || player.status === "ABANDONED") continue;
    if (player.stackCents <= 0) continue;
    count++;
  }
  return count;
}

export function countNotFoldedPlayers(state: PokerState): number {
  let count = 0;
  for (const player of state.playersById.values()) {
    if (player.status !== "FOLDED" && player.status !== "OUT" && player.status !== "ABANDONED") count++;
  }
  return count;
}

/**
 * Players to deal into the next hand. Priority:
 * 1. Seat order, ACTIVE and not sittingOutUntilNextHand.
 * 2. All ACTIVE and not sittingOutUntilNextHand, sorted by seat.
 * 3. All ACTIVE, sorted by seat.
 * Returns the first set with at least 2 players, or the last attempt (may be 0 or 1).
 */
export function resolveActivePlayersForHand(state: PokerState): PlayerState[] {
  const bySeatOrder = [...iterPlayersInSeatOrder(state)].filter(
    (p) => p.status === "ACTIVE" && p.sittingOutUntilNextHand !== true,
  );
  if (bySeatOrder.length >= 2) return bySeatOrder;

  const fromMapNoSitOut = [...state.playersById.values()]
    .filter((p) => p.status === "ACTIVE" && p.sittingOutUntilNextHand !== true)
    .sort((a, b) => a.seat - b.seat);
  if (fromMapNoSitOut.length >= 2) return fromMapNoSitOut;

  const anyActive = [...state.playersById.values()]
    .filter((p) => p.status === "ACTIVE")
    .sort((a, b) => a.seat - b.seat);
  return anyActive;
}

export function resolvePlayersReadyForNextHand(state: PokerState): PlayerState[] {
  return [...iterPlayersInSeatOrder(state)].filter(
    (p) =>
      p.status !== "OUT" &&
      (p.status !== "ABANDONED" || state.tournamentMode) &&
      p.stackCents > 0 &&
      p.sittingOutUntilNextHand !== true,
  );
}

/** A cash table must pause for rebuy instead of starting a bot-only hand. */
export function hasHumanReadyForNextHand(players: readonly PlayerState[]): boolean {
  return players.some((player) => player.kind === "HUMAN");
}

/** Reset between-hand statuses so eligibility checks match deal intent (FOLDED/ABANDONED → ACTIVE). */
export function preparePlayersForNextHand(state: PokerState): void {
  for (const player of state.playersById.values()) {
    player.sittingOutUntilNextHand = false;
    if (player.stackCents <= 0) continue;
    if (player.status === "OUT") continue;
    if (player.status === "ABANDONED") {
      if (player.connected || state.tournamentMode) {
        player.status = "ACTIVE";
      }
      continue;
    }
    if (player.status !== "ACTIVE") {
      player.status = "ACTIVE";
    }
  }
}

/**
 * After a hand settles, clear hand-scoped statuses (ALL_IN/FOLDED) so seats show
 * real stacks during WAITING — winners show chips, busted players show OUT/zero.
 */
export function settlePlayerStatusesAfterHand(state: PokerState): void {
  for (const player of state.playersById.values()) {
    if (player.status === "ABANDONED") continue;
    if (player.stackCents <= 0) {
      player.status = "OUT";
      continue;
    }
    if (player.status === "OUT") continue;
    player.status = "ACTIVE";
  }
}
