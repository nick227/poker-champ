import { isLateRegistrationOpen, lateRegCloseMs } from "@/lib/tournament-schedule";
import {
  formatCountdownTo,
  formatTournamentStartLocal,
  isTournamentBotChallengeMode,
  isTournamentTableLive,
  tournamentStartMs,
} from "@/lib/tournament.utils";
import type { TournamentSummary } from "@/services/tournaments.types";

export type TournamentLobbyTimerView = {
  mode: "countdown" | "countup";
  headline: string;
  time: string;
  detail?: string;
};

export function formatElapsedSince(
  startMs: number,
  nowMs: number = Date.now(),
): string | null {
  if (!Number.isFinite(startMs)) return null;
  const elapsedMs = nowMs - startMs;
  if (elapsedMs < 0) return null;
  const totalSec = Math.floor(elapsedMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min >= 60) {
    const hr = Math.floor(min / 60);
    const remMin = min % 60;
    return `${hr}h ${remMin}m`;
  }
  return min > 0 ? `${min}:${String(sec).padStart(2, "0")}` : `${sec}s`;
}

function levelDetail(tournament: TournamentSummary): string {
  return `Level ${tournament.currentLevel}`;
}

export function resolveTournamentLobbyTimer(
  tournament: TournamentSummary,
  nowMs: number = Date.now(),
): TournamentLobbyTimerView | null {
  const startMs = tournamentStartMs(tournament);
  if (!Number.isFinite(startMs)) return null;

  if (tournament.status === "REGISTERING") {
    const countdown = formatCountdownTo(startMs, nowMs);
    if (countdown) {
      return { mode: "countdown", headline: "Starts in", time: countdown };
    }
    const elapsed = formatElapsedSince(startMs, nowMs);
    if (elapsed) {
      return { mode: "countup", headline: "Starting", time: elapsed };
    }
    return null;
  }

  if (
    tournament.status === "STARTING" ||
    tournament.status === "LATE_REG" ||
    tournament.status === "RUNNING"
  ) {
    const elapsed = formatElapsedSince(startMs, nowMs) ?? "0s";
    const detailParts: string[] = [levelDetail(tournament)];

    if (tournament.status === "LATE_REG" && isLateRegistrationOpen(tournament, nowMs)) {
      const lateCountdown = formatCountdownTo(lateRegCloseMs(tournament), nowMs);
      if (lateCountdown) detailParts.push(`late reg closes in ${lateCountdown}`);
    }

    const headline =
      tournament.status === "STARTING"
        ? "Starting"
        : tournament.status === "LATE_REG" && isLateRegistrationOpen(tournament, nowMs)
          ? "Running"
          : "Running";

    return {
      mode: "countup",
      headline,
      time: elapsed,
      detail: detailParts.join(" · "),
    };
  }

  return null;
}

export function isLobbyTimerVisible(tournament: TournamentSummary, nowMs: number = Date.now()): boolean {
  return resolveTournamentLobbyTimer(tournament, nowMs) != null;
}

/** Non-timer context line shown under the live clock on lobby cards. */
export function formatTournamentSupplementHint(
  tournament: TournamentSummary,
  nowMs: number = Date.now(),
): string | null {
  if (!isLobbyTimerVisible(tournament, nowMs)) return null;

  if (tournament.status === "REGISTERING") {
    if (isTournamentBotChallengeMode(tournament)) {
      return "Bot challenge · one human vs bots";
    }
    return `Starts ${formatTournamentStartLocal(tournament.startTime)}`;
  }

  if (isTournamentBotChallengeMode(tournament)) {
    if (tournament.status === "LATE_REG" && isTournamentTableLive(tournament)) {
      return "Bot challenge · live";
    }
    if (tournament.status === "LATE_REG") {
      return "Bot challenge · waiting for players";
    }
    if (tournament.status === "STARTING") {
      return isTournamentTableLive(tournament)
        ? "Bot challenge · join the table"
        : "Bot challenge · table opens shortly";
    }
  }

  if (tournament.status === "STARTING") {
    return isTournamentTableLive(tournament)
      ? "Join the table"
      : "Table opens shortly";
  }

  if (tournament.status === "LATE_REG" && !isTournamentTableLive(tournament)) {
    return "Waiting for players";
  }

  if (
    tournament.status === "RUNNING" &&
    tournament.tableLive === false &&
    !isLateRegistrationOpen(tournament, nowMs)
  ) {
    return "Table no longer active";
  }

  return null;
}
