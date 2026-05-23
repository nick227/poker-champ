import { isLateRegistrationOpen } from "@/lib/tournament-schedule";
import {
  isTournamentInJoinPhase,
  isTournamentPlayActive,
} from "@/lib/tournament.utils";
import type { TournamentCta, TournamentSummary } from "@/services/tournaments.types";

export type TournamentJoinSnapshot = {
  id: string;
  status: string;
  tableId: string | null;
  roomId: string | null;
  tableLive: boolean | null;
  isRegistered: boolean | null;
  currentLevel: number | null;
  registeredCount: number | null;
  startTime: string | null;
};

export function snapshotTournamentForJoinLog(
  tournament: TournamentSummary | null | undefined,
): TournamentJoinSnapshot | null {
  if (!tournament) return null;
  return {
    id: tournament.id,
    status: tournament.status,
    tableId: tournament.tableId ?? null,
    roomId: tournament.roomId ?? null,
    tableLive: tournament.tableLive ?? null,
    isRegistered: tournament.isRegistered ?? null,
    currentLevel: tournament.currentLevel ?? null,
    registeredCount: tournament.registeredCount ?? null,
    startTime: tournament.startTime ?? null,
  };
}

function logEvent(event: string, fields: Record<string, unknown>): void {
  console.log(`[${event}]`, fields);
}

export function logTournamentJoinClick(
  tournament: TournamentSummary,
  cta: TournamentCta,
  nowMs: number = Date.now(),
  storeSnapshot?: TournamentSummary | null,
): void {
  const clicked = snapshotTournamentForJoinLog(tournament);
  const store = snapshotTournamentForJoinLog(storeSnapshot ?? null);
  logEvent("TOURNAMENT_JOIN_CLICK", {
    tournamentId: tournament.id,
    status: tournament.status,
    tableId: tournament.tableId ?? null,
    roomId: tournament.roomId ?? null,
    tableLive: tournament.tableLive ?? null,
    isRegistered: tournament.isRegistered ?? null,
    isActive: isTournamentPlayActive(tournament) || isTournamentInJoinPhase(tournament, nowMs),
    lateRegOpen: isLateRegistrationOpen(tournament, nowMs),
    ctaLabel: cta.label,
    ctaAction: cta.action,
    ctaDisabled: cta.disabled,
    clickedSnapshot: clicked,
    storeSnapshot: store,
    storeMismatch:
      store != null && clicked != null
        ? store.id !== clicked.id ||
          store.status !== clicked.status ||
          store.tableId !== clicked.tableId ||
          store.roomId !== clicked.roomId ||
          store.tableLive !== clicked.tableLive ||
          store.isRegistered !== clicked.isRegistered
        : null,
  });
}

export function logTournamentEnsureRequest(tournamentId: string, source: string): void {
  logEvent("TOURNAMENT_ENSURE_REQUEST", { tournamentId, source });
}

export function logTournamentRegisterRequest(tournamentId: string, source: string): void {
  logEvent("TOURNAMENT_REGISTER_REQUEST", { tournamentId, source });
}

export function logTournamentEnsureResponse(
  tournamentId: string,
  response: {
    joinStatus?: string;
    playerStatus?: string;
    tableId?: string | null;
    roomId?: string | null;
    tableLive?: boolean;
    recoveryReason?: string;
    tournamentStatus?: string;
  },
): void {
  logEvent("TOURNAMENT_ENSURE_RESPONSE", {
    tournamentId,
    joinStatus: response.joinStatus ?? null,
    playerStatus: response.playerStatus ?? null,
    tableId: response.tableId ?? null,
    roomId: response.roomId ?? null,
    tableLive: response.tableLive ?? null,
    recoveryReason: response.recoveryReason ?? null,
    tournamentStatus: response.tournamentStatus ?? null,
  });
}

export function logTableOpenTarget(fields: {
  tournamentId: string;
  tableId: string;
  roomId: string;
  source: string;
}): void {
  logEvent("TABLE_OPEN_TARGET", fields);
}

export function logTournamentJoinBlockedClient(params: {
  tournamentId: string;
  reason: string;
  sourceFunction: string;
  tournamentSnapshot?: TournamentJoinSnapshot | null;
  extra?: Record<string, unknown>;
}): void {
  logEvent("TOURNAMENT_JOIN_BLOCKED_CLIENT", {
    tournamentId: params.tournamentId,
    reason: params.reason,
    sourceFunction: params.sourceFunction,
    tournamentSnapshot: params.tournamentSnapshot ?? null,
    ...params.extra,
  });
}

export function isNotFoundJoinMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return (
    normalized.includes("not found") ||
    normalized.includes("no longer exists") ||
    normalized.includes("table_gone")
  );
}
