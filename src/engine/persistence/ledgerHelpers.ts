import type { PlayerState } from "../../state/PlayerState.js";

/** True if player participates in ledger (User.bankroll / PlayerBalance). Bots do not. */
export function isLedgerParticipant(player: PlayerState): boolean {
  return player.kind === "HUMAN";
}
