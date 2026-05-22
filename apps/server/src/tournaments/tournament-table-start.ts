/** Minimum registrations before spawning the Colyseus table. */
export const MIN_TOURNAMENT_REGISTRATIONS_TO_START = 2;

export type TryStartTournamentTableResult =
  | { ok: true; roomId: string; tableId: string }
  | {
      ok: false;
      reason: "not_found" | "already_started" | "insufficient_registrations" | "start_failed";
      registrationCount?: number;
    };
