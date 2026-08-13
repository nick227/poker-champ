import { isLateRegistrationOpen } from "@/lib/tournament-schedule";
import { formatTournamentStartLocal } from "@/lib/tournament.utils";
import { resolveTournamentLobbyTimer } from "@/lib/tournamentLobbyTimer";
import type { TournamentSummary } from "@/services/tournaments.types";

export function formatLobbyStartsLine(
  tournament: TournamentSummary,
  nowMs: number,
): { text: string; tone: "warn" | "brand" | "muted" } {
  const timer = resolveTournamentLobbyTimer(tournament, nowMs);
  if (timer?.mode === "countdown") {
    return { text: `Starts in ${timer.time}`, tone: "warn" };
  }
  if (timer?.mode === "countup") {
    return { text: `Started ${timer.time} ago`, tone: "brand" };
  }
  return { text: formatTournamentStartLocal(tournament.startTime), tone: "muted" };
}

export function formatLateRegOpenLabel(
  tournament: TournamentSummary,
  nowMs: number,
): string {
  return isLateRegistrationOpen(tournament, nowMs) ? "Open" : "Closed";
}
