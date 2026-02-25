import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { PokerState } from "../../state/PokerState.js";
import { eligibleToAct } from "../rules/BettingRound.js";

const NON_ACTIONABLE_SNAPSHOT_REASONS = new Set<TableSnapshotPayload["reason"]>([
  "RUNOUT_STAGE",
  "HAND_END",
  "HAND_SHOWDOWN",
]);

export function getStateMoneyFindings(state: PokerState): string[] {
  const findings: string[] = [];
  if (state.potCents < 0) findings.push(`negative pot ${state.potCents}`);
  for (const player of state.playersById.values()) {
    if (player.stackCents < 0) findings.push(`negative stack user=${player.id} stack=${player.stackCents}`);
    if (player.roundBetCents < 0) findings.push(`negative roundBet user=${player.id} roundBet=${player.roundBetCents}`);
    if (player.committedCents < 0) findings.push(`negative committed user=${player.id} committed=${player.committedCents}`);
  }
  return findings;
}

export function isActionableStatePhase(state: PokerState): boolean {
  if (state.street === "WAITING" || state.street === "SHOWDOWN") return false;
  if (state.runoutMode === "STAGED") return false;
  for (const player of state.playersById.values()) {
    if (eligibleToAct(player) && player.needsAction) return true;
  }
  return false;
}

export function isSameHandActive(
  state: Pick<PokerState, "street" | "handId">,
  handIdBefore: string | null | undefined,
): boolean {
  if (!handIdBefore || !state.handId) return false;
  return state.handId === handIdBefore && state.street !== "WAITING";
}

export function getActionableToActSeatFindingFromState(state: PokerState): string | null {
  if (!isActionableStatePhase(state)) return null;
  const userId = state.seats[state.toActSeat];
  if (!userId) return `missing toActSeat occupant seat=${state.toActSeat}`;
  const player = state.playersById.get(userId);
  if (!player) return `toActSeat user missing from playersById seat=${state.toActSeat} user=${userId}`;
  if (!eligibleToAct(player)) return `toActSeat must be ACTIVE seat=${state.toActSeat} user=${userId} status=${player.status}`;
  if (!player.needsAction) return `toActSeat must have needsAction=true seat=${state.toActSeat} user=${userId}`;
  return null;
}

export function getSnapshotMoneyFindings(snapshot: TableSnapshotPayload): string[] {
  const findings: string[] = [];
  const potCents = snapshot.hand?.potCents ?? 0;
  if (potCents < 0) findings.push(`negative pot snapshot=${snapshot.snapshotId} pot=${potCents}`);
  for (const seat of snapshot.seats) {
    if (seat.stackCents < 0) findings.push(`negative stack seat=${seat.seat} snapshot=${snapshot.snapshotId}`);
    if (seat.roundBetCents < 0) findings.push(`negative roundBet seat=${seat.seat} snapshot=${snapshot.snapshotId}`);
    if (seat.committedCents < 0) findings.push(`negative committed seat=${seat.seat} snapshot=${snapshot.snapshotId}`);
  }
  return findings;
}

export function isActionableSnapshotPhase(snapshot: Pick<TableSnapshotPayload, "hand" | "reason" | "lastHandResult">): boolean {
  if (!snapshot.hand) return false;
  if (snapshot.hand.street === "WAITING" || snapshot.hand.street === "SHOWDOWN") return false;
  if (NON_ACTIONABLE_SNAPSHOT_REASONS.has(snapshot.reason)) return false;
  if (snapshot.lastHandResult?.handId && snapshot.lastHandResult.handId === snapshot.hand.handId) return false;
  return true;
}

export function getActionableToActSeatFindingFromSnapshot(snapshot: TableSnapshotPayload): string | null {
  if (!isActionableSnapshotPhase(snapshot)) return null;
  const toActSeat = snapshot.hand?.toActSeat;
  if (typeof toActSeat !== "number") return `missing toActSeat snapshot=${snapshot.snapshotId}`;
  const seat = snapshot.seats.find((s:any) => s.seat === toActSeat);
  if (!seat?.occupied) return `toActSeat points to empty seat snapshot=${snapshot.snapshotId} seat=${toActSeat}`;
  if (seat.status !== "ACTIVE") {
    return `toActSeat must be ACTIVE snapshot=${snapshot.snapshotId} seat=${toActSeat} status=${seat.status}`;
  }
  return null;
}
