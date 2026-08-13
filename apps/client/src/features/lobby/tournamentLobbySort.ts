import { isLateRegistrationOpen, lateRegCloseMs } from "@/lib/tournament-schedule";
import { tournamentStartMs } from "@/lib/tournament.utils";
import type { TournamentSummary } from "@/services/tournaments.types";
import type { LobbySortDir } from "./lobbyTableSort";

export type TournamentSortKey = "name" | "buyIn" | "enrolled" | "startTime" | "lateReg" | "status";

export const TOURNAMENT_SORT_INITIAL_DIR: Record<TournamentSortKey, LobbySortDir> = {
  name: "asc",
  buyIn: "desc",
  enrolled: "desc",
  startTime: "asc",
  lateReg: "asc",
  status: "asc",
};

function finiteOrLast(ms: number): number {
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

function startMs(tournament: TournamentSummary): number {
  return finiteOrLast(tournamentStartMs(tournament));
}

function lateMs(tournament: TournamentSummary): number {
  return finiteOrLast(lateRegCloseMs(tournament));
}

function statusRank(tournament: TournamentSummary, nowMs: number): number {
  const started = startMs(tournament) <= nowMs;
  const lateOpen = started && isLateRegistrationOpen(tournament, nowMs);
  if (tournament.status === "RUNNING" && !lateOpen) return 0;
  if (lateOpen || tournament.status === "LATE_REG") return 1;
  if (tournament.status === "STARTING") return 2;
  if (tournament.status === "REGISTERING") return 3;
  return 4;
}

function compareTournamentLobbyRows(
  a: TournamentSummary,
  b: TournamentSummary,
  key: TournamentSortKey,
  nowMs: number,
): number {
  if (key === "name") return a.name.localeCompare(b.name);
  if (key === "buyIn") return a.entryFeeCents - b.entryFeeCents;
  if (key === "enrolled") {
    const seated = a.registeredCount - b.registeredCount;
    if (seated !== 0) return seated;
    return a.maxPlayers - b.maxPlayers;
  }
  if (key === "startTime") return startMs(a) - startMs(b);
  if (key === "lateReg") return lateMs(a) - lateMs(b);
  return statusRank(a, nowMs) - statusRank(b, nowMs);
}

export function sortTournamentLobbyRows(
  rows: TournamentSummary[],
  key: TournamentSortKey,
  dir: LobbySortDir,
  nowMs: number,
): TournamentSummary[] {
  const sorted = [...rows].sort((a, b) => {
    const d = compareTournamentLobbyRows(a, b, key, nowMs);
    if (d !== 0) return d;
    return a.name.localeCompare(b.name);
  });
  return dir === "asc" ? sorted : sorted.reverse();
}
