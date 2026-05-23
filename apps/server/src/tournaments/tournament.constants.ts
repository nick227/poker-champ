export const TOURNAMENT_BLIND_STRUCTURE_IDS = [
  "fast_4min",
  "standard_8min",
  "long_12min",
] as const;

export type TournamentBlindStructureId = (typeof TOURNAMENT_BLIND_STRUCTURE_IDS)[number];

export const DEFAULT_BLIND_STRUCTURE_ID: TournamentBlindStructureId = "standard_8min";

export const DEFAULT_STARTING_STACK_CENTS = 10_000;

export function isTournamentBlindStructureId(value: string): value is TournamentBlindStructureId {
  return (TOURNAMENT_BLIND_STRUCTURE_IDS as readonly string[]).includes(value);
}

export function tournamentEntryExternalRef(tournamentId: string, userId: string): string {
  return `tournament_entry_${tournamentId}_${userId}`;
}

export function tournamentRefundExternalRef(tournamentId: string, userId: string): string {
  return `tournament_refund_${tournamentId}_${userId}`;
}

export function tournamentCancelExternalRef(tournamentId: string): string {
  return `tournament_cancel_${tournamentId}`;
}

export function tournamentAbandonExternalRef(tournamentId: string): string {
  return `tournament_abandon_${tournamentId}`;
}

export function tournamentAbandonRefundExternalRef(tournamentId: string, userId: string): string {
  return `tournament_abandon_refund_${tournamentId}_${userId}`;
}

export function tournamentSeatGrantExternalRef(tournamentId: string, userId: string): string {
  return `tournament_seat_${tournamentId}_${userId}`;
}

export function tournamentBotEntryExternalRef(tournamentId: string, userId: string): string {
  return `tournament_bot_entry_${tournamentId}_${userId}`;
}
