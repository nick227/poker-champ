import { PokerError } from "../engine/errors.js";
import { isTournamentTableSpectator } from "./tournament-join-guard.js";
import { TOURNAMENT_SPECTATOR_READONLY } from "./tournament.errors.js";

export function assertNotTournamentTableSpectator(params: {
  tournamentId: string | undefined;
  hasPlayer: (userId: string) => boolean;
  userId: string;
}): void {
  if (
    isTournamentTableSpectator({
      tournamentId: params.tournamentId,
      hasPlayer: params.hasPlayer,
      userId: params.userId,
    })
  ) {
    throw new PokerError(
      TOURNAMENT_SPECTATOR_READONLY,
      "Eliminated players can only watch this tournament table.",
    );
  }
}
