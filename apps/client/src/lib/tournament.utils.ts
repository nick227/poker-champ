import { isLateRegistrationOpen, lateRegCloseMs } from "@/lib/tournament-schedule";
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
    hour12: true,
    timeZoneName: "short",
  });
}

export function formatTournamentStatus(status: string): string {
  switch (status) {
    case "REGISTERING":
      return "Registering";
    case "STARTING":
      return "Starting";
    case "LATE_REG":
      return "Late registration";
    case "RUNNING":
      return "Running";
    case "FINISHED":
      return "Finished";
    case "CANCELLED":
      return "Cancelled";
    case "ABANDONED":
      return "Abandoned";
    default:
      return status;
  }
}

export function tournamentStartMs(tournament: TournamentSummary): number {
  return new Date(tournament.startTime).getTime();
}

export function isTournamentStartDue(
  tournament: TournamentSummary,
  nowMs: number = Date.now(),
): boolean {
  const startTs = tournamentStartMs(tournament);
  return Number.isFinite(startTs) && startTs <= nowMs;
}

export function isTournamentRegistrationOpen(
  tournament: TournamentSummary,
  nowMs: number = Date.now(),
): boolean {
  if (tournament.status === "REGISTERING") return true;
  return isLateRegistrationOpen(tournament, nowMs);
}

export function isTournamentInJoinPhase(
  tournament: TournamentSummary,
  nowMs: number = Date.now(),
): boolean {
  if (
    tournament.status === "STARTING" ||
    tournament.status === "LATE_REG" ||
    tournament.status === "RUNNING"
  ) {
    return true;
  }
  return tournament.status === "REGISTERING" && isTournamentStartDue(tournament, nowMs);
}

/** Tournament is actively dealing or in late reg — table may still be spinning up. */
export function isTournamentPlayActive(tournament: TournamentSummary): boolean {
  return (
    tournament.status === "STARTING" ||
    tournament.status === "LATE_REG" ||
    tournament.status === "RUNNING"
  );
}

export function isTournamentTableLive(tournament: TournamentSummary): boolean {
  if (!tournament.tableId || !tournament.roomId) return false;
  return tournament.tableLive === true;
}

export function hasTournamentTableTarget(tournament: TournamentSummary): boolean {
  return Boolean(tournament.tableId && tournament.roomId);
}

/** Matches server MIN_TOURNAMENT_REGISTRATIONS_TO_START. */
export const MIN_TOURNAMENT_REGISTRATIONS_TO_START = 2;

export function isTournamentAwaitingTablePlayers(tournament: TournamentSummary): boolean {
  return (
    tournament.isRegistered === true &&
    isTournamentPlayActive(tournament) &&
    !hasTournamentTableTarget(tournament) &&
    tournament.registeredCount < MIN_TOURNAMENT_REGISTRATIONS_TO_START
  );
}

export function resolveTournamentJoinWaitLabel(tournament: TournamentSummary): string {
  if (isTournamentAwaitingTablePlayers(tournament)) {
    return "Waiting for players";
  }
  return "Starting soon…";
}

export function canJoinTournament(
  tournament: TournamentSummary,
  nowMs: number = Date.now(),
): boolean {
  if (!isTournamentInJoinPhase(tournament, nowMs) || !tournament.isRegistered) {
    return false;
  }
  if (tournament.status === "RUNNING") {
    if (isLateRegistrationOpen(tournament, nowMs)) {
      return hasTournamentTableTarget(tournament);
    }
    return isTournamentTableLive(tournament);
  }
  if (isTournamentPlayActive(tournament)) {
    return hasTournamentTableTarget(tournament);
  }
  return isTournamentTableLive(tournament);
}

function resolveTournamentJoinCta(
  tournament: TournamentSummary,
  authenticated: boolean,
  nowMs: number,
): TournamentCta {
  const joinReady = canJoinTournament(tournament, nowMs);
  if (!joinReady) {
    if (!authenticated) {
      return { label: "Log in to join", action: "join", disabled: true };
    }
    if (tournament.isRegistered !== true) {
      return { label: "Not registered", action: "none", disabled: true };
    }
    if (
      tournament.tableLive === false &&
      hasTournamentTableTarget(tournament) &&
      tournament.status === "RUNNING" &&
      !isLateRegistrationOpen(tournament, nowMs)
    ) {
      return { label: "Table ended", action: "join", disabled: true };
    }
    return {
      label: resolveTournamentJoinWaitLabel(tournament),
      action: "join",
      disabled: true,
    };
  }
  return { label: "Join Table", action: "join", disabled: false };
}

export function resolveTournamentCta(
  tournament: TournamentSummary,
  opts?: { authenticated?: boolean; nowMs?: number },
): TournamentCta {
  const authenticated = opts?.authenticated !== false;
  const nowMs = opts?.nowMs ?? Date.now();

  if (tournament.status === "CANCELLED") {
    return { label: "Cancelled", action: "none", disabled: true };
  }

  if (tournament.status === "FINISHED") {
    return { label: "View Standings", action: "standings", disabled: false };
  }

  if (tournament.status === "ABANDONED") {
    return { label: "View Standings", action: "standings", disabled: false };
  }

  if (isTournamentRegistrationOpen(tournament, nowMs)) {
    if (!authenticated) {
      return { label: "Register", action: "register", disabled: false };
    }
    if (!tournament.isRegistered) {
      const full = tournament.registeredCount >= tournament.maxPlayers;
      return {
        label: "Register",
        action: "register",
        disabled: full,
      };
    }
    if (
      tournament.status === "REGISTERING" &&
      !isTournamentStartDue(tournament, nowMs)
    ) {
      return { label: "Unregister", action: "unregister", disabled: false };
    }
  }

  if (isTournamentInJoinPhase(tournament, nowMs)) {
    return resolveTournamentJoinCta(tournament, authenticated, nowMs);
  }

  return { label: "Unavailable", action: "none", disabled: true };
}

export type TournamentLobbySection = "upcoming" | "running";

const PUBLIC_LOBBY_STATUSES = new Set(["REGISTERING", "LATE_REG", "STARTING", "RUNNING"]);

/** Active + recent terminal states so joined rows do not vanish after cancel/finish. */
const JOINED_VISIBLE_STATUSES = new Set([
  ...PUBLIC_LOBBY_STATUSES,
  "FINISHED",
  "ABANDONED",
  "CANCELLED",
]);

export function isJoinedVisibleTournament(tournament: TournamentSummary): boolean {
  return Boolean(tournament.isRegistered) && JOINED_VISIBLE_STATUSES.has(tournament.status);
}

/** @deprecated Alias for isJoinedVisibleTournament */
export function isJoinedActiveTournament(tournament: TournamentSummary): boolean {
  return isJoinedVisibleTournament(tournament);
}

/** Registered tournaments: scheduled, live, and recent cancelled/finished. */
export function selectJoinedTournaments(tournaments: TournamentSummary[]): TournamentSummary[] {
  return tournaments
    .filter(isJoinedVisibleTournament)
    .sort((a, b) => {
      const rank = (status: string) => {
        if (status === "RUNNING" || status === "STARTING" || status === "LATE_REG") return 0;
        if (status === "REGISTERING") return 1;
        if (status === "FINISHED" || status === "ABANDONED") return 2;
        return 3;
      };
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

export function formatJoinedTournamentHint(
  tournament: TournamentSummary,
  nowMs: number = Date.now(),
): string {
  if (tournament.status === "REGISTERING") {
    const startTs = tournamentStartMs(tournament);
    if (!Number.isFinite(startTs)) {
      return `Scheduled · ${formatTournamentStartLocal(tournament.startTime)}`;
    }
    const countdown = formatCountdownTo(startTs, nowMs);
    if (countdown) {
      return `Scheduled · starts in ${countdown}`;
    }
    return `Scheduled · ${formatTournamentStartLocal(tournament.startTime)}`;
  }
  if (tournament.status === "LATE_REG" || isLateRegistrationOpen(tournament, nowMs)) {
    const closeTs = lateRegCloseMs(tournament);
    const lateCountdown = formatCountdownTo(closeTs, nowMs);
    if (isTournamentTableLive(tournament)) {
      return lateCountdown
        ? `Live · late registration closes in ${lateCountdown}`
        : "Live · late registration closed";
    }
    return lateCountdown
      ? `Late registration · closes in ${lateCountdown}`
      : "Late registration · waiting for players";
  }
  if (tournament.status === "STARTING") {
    if (isTournamentTableLive(tournament)) return "Live · join the table";
    return "Starting now · table opens shortly";
  }
  if (tournament.status === "RUNNING") {
    if (
      tournament.tableLive === false &&
      !isLateRegistrationOpen(tournament, nowMs)
    ) {
      return "Ended · table no longer active";
    }
    return `Live · level ${tournament.currentLevel}`;
  }
  if (tournament.status === "CANCELLED") {
    return "Cancelled · entry fee refunded";
  }
  if (tournament.status === "FINISHED") {
    return "Finished · view standings for results";
  }
  if (tournament.status === "ABANDONED") {
    return "Abandoned · no winner · entry fee refunded";
  }
  return formatTournamentStatus(tournament.status);
}

export function groupTournamentsForLobby(tournaments: TournamentSummary[]): Record<TournamentLobbySection, TournamentSummary[]> {
  const upcoming: TournamentSummary[] = [];
  const running: TournamentSummary[] = [];

  for (const t of tournaments) {
    if (t.status === "REGISTERING") {
      upcoming.push(t);
    } else if (t.status === "STARTING" || t.status === "LATE_REG" || t.status === "RUNNING") {
      running.push(t);
    }
  }

  upcoming.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  running.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  return { upcoming, running };
}

export function formatCountdownTo(
  ts: number | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (ts == null || !Number.isFinite(ts)) return null;
  const remainingMs = ts - nowMs;
  if (remainingMs <= 0) return null;
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
    case "TOURNAMENT_REBUY_NOT_ALLOWED":
      return "Rebuys are not allowed in this freezeout tournament.";
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
