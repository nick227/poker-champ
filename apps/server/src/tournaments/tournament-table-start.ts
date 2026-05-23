/** Minimum registrations before creating the tournament table (room can open empty). */
export const MIN_TOURNAMENT_REGISTRATIONS_TO_PROVISION = 1;

/** Minimum seated players before flipping to RUNNING and dealing. */
export const MIN_TOURNAMENT_SEATED_TO_DEAL = 2;

/** Minimum seated humans before a valid tournament hand may deal. */
export const MIN_TOURNAMENT_SEATED_HUMANS_TO_DEAL = 1;

/** @deprecated Use MIN_TOURNAMENT_REGISTRATIONS_TO_PROVISION */
export const MIN_TOURNAMENT_REGISTRATIONS_TO_START = MIN_TOURNAMENT_REGISTRATIONS_TO_PROVISION;

export type TryStartTournamentTableResult =
  | { ok: true; roomId: string; tableId: string }
  | {
      ok: false;
      reason: "not_found" | "already_started" | "not_due" | "insufficient_registrations" | "start_failed";
      registrationCount?: number;
    };
