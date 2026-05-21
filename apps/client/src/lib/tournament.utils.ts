import type { TournamentCta, TournamentSummary } from "@/services/tournaments.types";

export function formatTournamentStartLocal(startTimeIso: string): string {
  const date = new Date(startTimeIso);
  if (Number.isNaN(date.getTime())) return "Invalid start time";
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
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

export function isTournamentTableLive(tournament: TournamentSummary): boolean {
  if (!tournament.tableId || !tournament.roomId) return false;
  return tournament.tableLive === true;
}

export function canJoinTournament(tournament: TournamentSummary): boolean {
  return (
    (tournament.status === "STARTING" || tournament.status === "RUNNING") &&
    Boolean(tournament.isRegistered) &&
    isTournamentTableLive(tournament)
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
    if (!joinReady) {
      if (!authenticated) {
        return { label: "Log in to join", action: "join", disabled: true };
      }
      if (tournament.isRegistered !== true) {
        return { label: "Not registered", action: "none", disabled: true };
      }
      if (tournament.tableLive === false) {
        return { label: "Table ended", action: "join", disabled: true };
      }
      return { label: "Starting soon…", action: "join", disabled: true };
    }
    return {
      label: "Join Table",
      action: "join",
      disabled: false,
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

export type TournamentLobbySection = "upcoming" | "running";

const PUBLIC_LOBBY_STATUSES = new Set(["REGISTERING", "STARTING", "RUNNING"]);

const JOINED_ACTIVE_STATUSES = PUBLIC_LOBBY_STATUSES;

export function isJoinedActiveTournament(tournament: TournamentSummary): boolean {
  return Boolean(tournament.isRegistered) && JOINED_ACTIVE_STATUSES.has(tournament.status);
}

/** Registered tournaments that are scheduled or live (excludes finished/cancelled). */
export function selectJoinedTournaments(tournaments: TournamentSummary[]): TournamentSummary[] {
  return tournaments
    .filter(isJoinedActiveTournament)
    .sort((a, b) => {
      const rank = (status: string) => (status === "RUNNING" || status === "STARTING" ? 0 : 1);
      const byPhase = rank(a.status) - rank(b.status);
      if (byPhase !== 0) return byPhase;
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });
}

/** Lobby browse: scheduled and live only (no finished/cancelled). */
export function canCreatorDeleteTournament(tournament: TournamentSummary): boolean {
  return (
    tournament.isCreator === true &&
    tournament.status === "REGISTERING" &&
    tournament.registeredCount === 0
  );
}

export function filterTournamentsForPublicLobby(tournaments: TournamentSummary[]): TournamentSummary[] {
  return tournaments.filter((t) => PUBLIC_LOBBY_STATUSES.has(t.status));
}

/** Browse list: public lobby rows minus active joined (shown in Your tournaments). */
export function filterTournamentsForBrowseLobby(tournaments: TournamentSummary[]): TournamentSummary[] {
  const joinedIds = new Set(selectJoinedTournaments(tournaments).map((t) => t.id));
  return filterTournamentsForPublicLobby(tournaments).filter((t) => !joinedIds.has(t.id));
}

export function formatJoinedTournamentHint(tournament: TournamentSummary): string {
  if (tournament.status === "REGISTERING") {
    const startTs = new Date(tournament.startTime).getTime();
    const countdown = formatCountdownTo(startTs);
    if (countdown && countdown !== "Now") {
      return `Scheduled · starts in ${countdown}`;
    }
    return `Scheduled · ${formatTournamentStartLocal(tournament.startTime)}`;
  }
  if (tournament.status === "STARTING") {
    return "Starting · table opens shortly";
  }
  if (tournament.status === "RUNNING") {
    if (tournament.tableLive === false) return "Ended · table no longer active";
    return `Live · level ${tournament.currentLevel}`;
  }
  return formatTournamentStatus(tournament.status);
}

export function groupTournamentsForLobby(tournaments: TournamentSummary[]): Record<TournamentLobbySection, TournamentSummary[]> {
  const upcoming: TournamentSummary[] = [];
  const running: TournamentSummary[] = [];

  for (const t of tournaments) {
    if (t.status === "REGISTERING") {
      upcoming.push(t);
    } else if (t.status === "STARTING" || t.status === "RUNNING") {
      running.push(t);
    }
  }

  upcoming.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  running.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  return { upcoming, running };
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
    case "TOURNAMENT_NOT_CANCELLABLE":
      return "Only registering tournaments can be cancelled.";
    case "TOURNAMENT_CANCEL_FORBIDDEN":
      return "You can only delete tournaments you created.";
    case "TOURNAMENT_HAS_REGISTRATIONS":
      return "Cannot delete a tournament after players have registered.";
    case "TOURNAMENT_JOIN_CLOSED":
      return "This tournament is not open for table joins.";
    case "TOURNAMENT_SPECTATOR_READONLY":
      return "Eliminated players can only watch this tournament table.";
    case "Invalid tournament payload":
      return "Check tournament details and try again.";
    case "Tournament not found":
      return "This tournament no longer exists.";
    case "Tournament registration failed":
      return "Could not register for this tournament. Please try again.";
    case "Tournament unregister failed":
      return "Could not unregister. Please try again.";
    case "Tournament cancel failed":
      return "Could not cancel this tournament. Please try again.";
    default:
      return code;
  }
}

/** Map API error message and/or code to a player-friendly string. */
export function mapTournamentApiError(message: string, code?: string): string {
  const trimmed = message.trim();
  if (code) {
    const fromCode = mapTournamentErrorMessage(code);
    if (fromCode !== code) return fromCode;
  }
  const fromMessage = mapTournamentErrorMessage(trimmed);
  if (fromMessage !== trimmed) return fromMessage;

  const token = trimmed.split(/\s+/).find((part) => mapTournamentErrorMessage(part) !== part);
  if (token) return mapTournamentErrorMessage(token);

  if (/failed to load tournaments/i.test(trimmed)) {
    return "Could not load tournaments. Check your connection and try again.";
  }

  return trimmed || "Something went wrong. Please try again.";
}
