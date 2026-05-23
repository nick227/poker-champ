import { formatCents } from "@/lib/format";
import type { TournamentStandingRow } from "@/services/tournaments.types";

/** Secondary label for a standings row (no-show / busted / winner). */
export function formatTournamentStandingStatus(row: TournamentStandingRow): string | null {
  if (row.isBot) return "Prize ineligible";
  if (row.finishPlace == null) return "No-show";
  if (row.eliminatedAt) return "Busted";
  if (row.finishPlace === 1) return "Winner";
  return "Finished";
}

export type TournamentStandingsPayoutMode = "prizes" | "refunds" | "hidden";

export function resolveTournamentStandingsPayoutMode(
  tournamentStatus: string,
): TournamentStandingsPayoutMode {
  if (tournamentStatus === "FINISHED") return "prizes";
  if (tournamentStatus === "CANCELLED" || tournamentStatus === "ABANDONED") return "refunds";
  return "hidden";
}

export function formatTournamentStandingPayout(
  row: TournamentStandingRow,
  mode: TournamentStandingsPayoutMode,
): string | null {
  if (mode === "hidden") return null;
  if (row.isBot) return "—";
  if (mode === "refunds") {
    return row.payoutCents > 0 ? formatCents(row.payoutCents) : "Refunded";
  }
  return row.payoutCents > 0 ? formatCents(row.payoutCents) : "—";
}
