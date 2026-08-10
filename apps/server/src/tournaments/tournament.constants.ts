export const TOURNAMENT_BLIND_STRUCTURE_IDS = [
  "fast_4min",
  "standard_8min",
  "long_12min",
] as const;

export type TournamentBlindStructureId = (typeof TOURNAMENT_BLIND_STRUCTURE_IDS)[number];

export const DEFAULT_BLIND_STRUCTURE_ID: TournamentBlindStructureId = "standard_8min";

export const DEFAULT_STARTING_STACK_CENTS = 10_000;

/**
 * Per-table seat cap for multi-table tournaments (MTT). Decoupled from `Tournament.maxPlayers`
 * (the tournament-wide field cap): tableCount = ceil(seatedPlayerCount / MAX_SEATS_PER_TABLE).
 * See docs/proposals/MULTI_TABLE_TOURNAMENT_PROPOSAL.md.
 */
export const MAX_SEATS_PER_TABLE = 9;

/**
 * Hand-for-hand trigger buffer (MTT proposal Phase 4): hand-for-hand activates once the
 * tournament-wide remaining-registration count drops to `paidPlaces + this buffer`. Only matters
 * once a multi-table tournament nears the money -- with 1 live table there's no cross-table pace
 * to synchronize, so it never activates for N=1.
 */
export const HAND_FOR_HAND_BUBBLE_BUFFER = 3;

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

export function tournamentCancelRefundExternalRef(tournamentId: string, userId: string): string {
  return `tournament_cancel_refund_${tournamentId}_${userId}`;
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
