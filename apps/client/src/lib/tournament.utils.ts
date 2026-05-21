import type { TournamentCta, TournamentSummary } from "@/services/tournaments.types";

export function formatTournamentStartLocal(startTimeIso: string): string {
  const date = new Date(startTimeIso);
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTournamentStatus(status: string): string {
  switch (status) {
    case "REGISTERING":
      return "Registering";
    case "STARTING":
      return "Starting";
    case "RUNNING":
      return "Running";
    case "FINISHED":
      return "Finished";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
  }
}

export function canJoinTournament(tournament: TournamentSummary): boolean {
  return (
    (tournament.status === "STARTING" || tournament.status === "RUNNING") &&
    Boolean(tournament.isRegistered) &&
    Boolean(tournament.tableId) &&
    Boolean(tournament.roomId)
  );
}

export function resolveTournamentCta(
  tournament: TournamentSummary,
  opts?: { authenticated?: boolean },
): TournamentCta {
  const authenticated = opts?.authenticated !== false;

  if (tournament.status === "CANCELLED") {
    return { label: "Cancelled", action: "none", disabled: true };
  }

  if (tournament.status === "FINISHED") {
    return { label: "View Standings", action: "standings", disabled: false };
  }

  if (tournament.status === "STARTING" || tournament.status === "RUNNING") {
    const joinReady = canJoinTournament(tournament);
    return {
      label: "Join Table",
      action: "join",
      disabled: !authenticated || !joinReady,
    };
  }

  if (tournament.status === "REGISTERING") {
    if (!authenticated) {
      return { label: "Register", action: "register", disabled: false };
    }
    if (tournament.isRegistered) {
      return { label: "Unregister", action: "unregister", disabled: false };
    }
    const full = tournament.registeredCount >= tournament.maxPlayers;
    return {
      label: "Register",
      action: "register",
      disabled: full,
    };
  }

  return { label: "Unavailable", action: "none", disabled: true };
}

export type TournamentLobbySection = "upcoming" | "running" | "recent";

export function groupTournamentsForLobby(tournaments: TournamentSummary[]): Record<TournamentLobbySection, TournamentSummary[]> {
  const upcoming: TournamentSummary[] = [];
  const running: TournamentSummary[] = [];
  const recent: TournamentSummary[] = [];

  for (const t of tournaments) {
    if (t.status === "REGISTERING") {
      upcoming.push(t);
    } else if (t.status === "STARTING" || t.status === "RUNNING") {
      running.push(t);
    } else if (t.status === "FINISHED" || t.status === "CANCELLED") {
      recent.push(t);
    }
  }

  upcoming.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  running.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  recent.sort((a, b) => {
    const aTs = new Date(a.finishedAt ?? a.startTime).getTime();
    const bTs = new Date(b.finishedAt ?? b.startTime).getTime();
    return bTs - aTs;
  });

  return {
    upcoming,
    running,
    recent: recent.slice(0, 10),
  };
}

export function formatCountdownTo(ts: number | null | undefined): string | null {
  if (ts == null || !Number.isFinite(ts)) return null;
  const remainingMs = ts - Date.now();
  if (remainingMs <= 0) return "Now";
  const totalSec = Math.ceil(remainingMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min >= 60) {
    const hr = Math.floor(min / 60);
    const remMin = min % 60;
    return `${hr}h ${remMin}m`;
  }
  return min > 0 ? `${min}:${String(sec).padStart(2, "0")}` : `${sec}s`;
}

export function mapTournamentErrorMessage(code: string): string {
  switch (code) {
    case "INSUFFICIENT_BANKROLL":
      return "Insufficient bankroll for this entry fee.";
    case "TOURNAMENT_FULL":
      return "This tournament is full.";
    case "TOURNAMENT_CLOSED":
      return "Registration is closed for this tournament.";
    case "NOT_REGISTERED":
    case "TOURNAMENT_NOT_REGISTERED":
      return "You are not registered for this tournament.";
    default:
      return code;
  }
}
