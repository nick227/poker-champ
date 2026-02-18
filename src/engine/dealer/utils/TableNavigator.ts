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
    if (player && player.status !== "OUT") order.push(id);
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
    if (player.status !== "FOLDED" && player.status !== "OUT") count++;
  }
  return count;
}
