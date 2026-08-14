import { isLateRegistrationOpen, lateRegCloseMs } from "@/lib/tournament-schedule";
import { formatTournamentStartLocal, tournamentStartMs } from "@/lib/tournament.utils";
import { resolveTournamentLobbyTimer } from "@/lib/tournamentLobbyTimer";
import type { TournamentSummary } from "@/services/tournaments.types";
import { formatLobbyDurationMs } from "./lobbyFormat";

export function formatLobbyStartsLine(
  tournament: TournamentSummary,
  nowMs: number,
  compact = false,
): { text: string; tone: "warn" | "brand" | "muted" } {
  const timer = resolveTournamentLobbyTimer(tournament, nowMs);
  const startMs = tournamentStartMs(tournament);
  if (timer?.mode === "countdown") {
    const dur = formatLobbyDurationMs(startMs - nowMs);
    return { text: compact ? `in ${dur ?? timer.time}` : `Starts in ${dur ?? timer.time}`, tone: "warn" };
  }
  if (timer?.mode === "countup") {
    const dur = formatLobbyDurationMs(nowMs - startMs);
    return { text: compact ? `${dur ?? timer.time} ago` : `Started ${dur ?? timer.time} ago`, tone: "brand" };
  }
  return { text: formatTournamentStartLocal(tournament.startTime), tone: "muted" };
}

export function formatLateRegOpenLabel(
  tournament: TournamentSummary,
  nowMs: number,
): string {
  if (!isLateRegistrationOpen(tournament, nowMs)) return "Closed";
  return formatLobbyDurationMs(lateRegCloseMs(tournament) - nowMs) ?? "Open";
}

export function isLobbyLateRegDisplay(
  tournament: TournamentSummary,
  nowMs: number,
): boolean {
  return tournamentStartMs(tournament) <= nowMs && isLateRegistrationOpen(tournament, nowMs);
}

export function formatLobbyTournamentStatus(
  tournament: TournamentSummary,
  nowMs: number,
): string {
  if (isLobbyLateRegDisplay(tournament, nowMs)) return "Late Reg";
  if (tournament.status === "LATE_REG") return "Late Reg";
  if (tournament.status === "REGISTERING") return "Registering";
  if (tournament.status === "STARTING") return "Starting";
  if (tournament.status === "RUNNING") return "Running";
  return tournament.status;
}

export function lobbyTournamentStatusClass(
  tournament: TournamentSummary,
  nowMs: number,
  pinned: boolean,
): string {
  if (pinned) return "text-brand";
  if (isLobbyLateRegDisplay(tournament, nowMs) || tournament.status === "LATE_REG") {
    return "text-gold";
  }
  if (
    tournament.status === "REGISTERING" ||
    tournament.status === "RUNNING" ||
    tournament.status === "STARTING"
  ) {
    return "text-brand";
  }
  return "text-muted";
}

export function compactTournamentCtaLabel(label: string): string {
  if (label === "Join Table") return "Join";
  if (label === "Log in to register") return "Log in";
  if (label === "View Standings") return "Standings";
  if (label === "Registration closed") return "Closed";
  if (label === "Table ended") return "Ended";
  if (label === "Starts soon") return "Soon";
  return label;
}
