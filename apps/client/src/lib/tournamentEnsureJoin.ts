import { ApiError } from "@poker-champ/sdk";
import {
  logTournamentEnsureRequest,
  logTournamentEnsureResponse,
  logTournamentJoinBlockedClient,
  snapshotTournamentForJoinLog,
} from "@/lib/tournamentJoinDiagnostics";
import { mapTournamentApiError } from "@/lib/tournament.utils";
import { postTournamentEnsureTable } from "@/services/post/tournaments.ensure-table";
import type { TournamentEnsureJoinStatus } from "@/services/post/tournaments.ensure-table";
import type { TournamentSummary } from "@/services/tournaments.types";

const BLOCKED_TOURNAMENT_STATUSES = new Set(["FINISHED", "CANCELLED", "ABANDONED"]);
const NAVIGABLE_ENSURE_STATUSES = new Set<TournamentEnsureJoinStatus>([
  "READY",
  "RESTORED",
  "CREATING_TABLE",
]);

export type TournamentEnsureJoinOk = {
  ok: true;
  tournament: TournamentSummary;
  tableId: string;
  roomId: string;
  buyInCents: number;
};

export type TournamentEnsureJoinBlocked = {
  ok: false;
  message: string;
};

export type TournamentEnsureJoinResult = TournamentEnsureJoinOk | TournamentEnsureJoinBlocked;

function isNavigateReady(tournament: TournamentSummary): boolean {
  return Boolean(tournament.tableId && tournament.roomId);
}

export function isTournamentTableJoinBlocked(status: string): boolean {
  return BLOCKED_TOURNAMENT_STATUSES.has(status);
}

function mapEnsureBlockedMessage(input: {
  joinStatus?: TournamentEnsureJoinStatus;
  recoveryReason?: string;
  tournamentStatus?: string;
  playerStatus?: string;
}): string {
  if (input.joinStatus === "ENDED" || (input.tournamentStatus && isTournamentTableJoinBlocked(input.tournamentStatus))) {
    return input.tournamentStatus === "FINISHED"
      ? "This tournament has ended."
      : input.tournamentStatus === "CANCELLED"
        ? "This tournament was cancelled."
        : "This tournament is no longer available.";
  }
  if (input.playerStatus === "ELIMINATED") {
    return "You have been eliminated from this tournament.";
  }
  if (input.recoveryReason) {
    return mapTournamentApiError(input.recoveryReason);
  }
  if (input.joinStatus === "NOT_ALLOWED") {
    return mapTournamentApiError("TOURNAMENT_JOIN_CLOSED");
  }
  if (input.joinStatus === "FAILED") {
    return mapTournamentApiError("TOURNAMENT_TABLE_UNAVAILABLE");
  }
  return mapTournamentApiError("TOURNAMENT_TABLE_UNAVAILABLE");
}

function ensureBlockedLogExtra(
  source: string,
  extra?: Record<string, unknown>,
  apiError?: ApiError | null,
): Record<string, unknown> {
  return {
    source,
    code: apiError?.code ?? extra?.code ?? null,
    status: apiError?.status ?? extra?.status ?? null,
    ...extra,
  };
}

function logEnsureBlocked(
  tournamentId: string,
  reason: string,
  sourceFunction: string,
  tournament?: TournamentSummary,
  extra?: Record<string, unknown>,
  apiError?: ApiError | null,
): TournamentEnsureJoinBlocked {
  const source = typeof extra?.source === "string" ? extra.source : "lobby_cta";
  logTournamentJoinBlockedClient({
    tournamentId,
    reason,
    sourceFunction,
    tournamentSnapshot: snapshotTournamentForJoinLog(tournament),
    extra: ensureBlockedLogExtra(source, extra, apiError),
  });
  return { ok: false, message: reason };
}

/** Always resolve a live table via ensure-table; cached ids are hints only. */
export async function resolveTournamentTableForJoin(
  tournamentId: string,
  source = "lobby_cta",
): Promise<TournamentEnsureJoinResult> {
  logTournamentEnsureRequest(tournamentId, source);
  try {
    const ensured = await postTournamentEnsureTable(tournamentId);
    logTournamentEnsureResponse(tournamentId, {
      joinStatus: ensured.joinStatus,
      playerStatus: ensured.playerStatus,
      tableId: ensured.tableId,
      roomId: ensured.roomId,
      tableLive: ensured.tableLive,
      recoveryReason: ensured.recoveryReason,
      tournamentStatus: ensured.tournamentStatus ?? ensured.tournament.status,
    });
    const tournamentStatus = ensured.tournamentStatus ?? ensured.tournament.status;
    const hasNewEnsureContract = Boolean(ensured.joinStatus);
    const tableId = hasNewEnsureContract
      ? ensured.tableId
      : (ensured.tableId ?? ensured.tournament.tableId);
    const roomId = hasNewEnsureContract
      ? ensured.roomId
      : (ensured.roomId ?? ensured.tournament.roomId);
    const tournament = {
      ...ensured.tournament,
      status: tournamentStatus,
      tableId,
      roomId,
      tableLive: ensured.tableLive ?? ensured.tournament.tableLive,
    };
    if (hasNewEnsureContract && !NAVIGABLE_ENSURE_STATUSES.has(ensured.joinStatus!)) {
      const message = mapEnsureBlockedMessage({
        joinStatus: ensured.joinStatus,
        recoveryReason: ensured.recoveryReason,
        tournamentStatus,
        playerStatus: ensured.playerStatus,
      });
      return logEnsureBlocked(tournamentId, message, "resolveTournamentTableForJoin:joinStatus", tournament, {
        joinStatus: ensured.joinStatus,
        playerStatus: ensured.playerStatus,
        source,
      });
    }
    if (!hasNewEnsureContract && isTournamentTableJoinBlocked(tournament.status)) {
      const message = mapEnsureBlockedMessage({ tournamentStatus: tournament.status });
      return logEnsureBlocked(tournamentId, message, "resolveTournamentTableForJoin:status", tournament, { source });
    }
    if (!tableId || !roomId) {
      const message = mapEnsureBlockedMessage({
        joinStatus: ensured.joinStatus,
        recoveryReason: ensured.recoveryReason,
        tournamentStatus,
        playerStatus: ensured.playerStatus,
      });
      return logEnsureBlocked(tournamentId, message, "resolveTournamentTableForJoin:missing_targets", tournament, {
        joinStatus: ensured.joinStatus,
        tableId,
        roomId,
        source,
      });
    }
    if (!isNavigateReady({ ...tournament, tableId, roomId })) {
      const message = mapEnsureBlockedMessage({
        joinStatus: ensured.joinStatus,
        recoveryReason: ensured.recoveryReason,
        tournamentStatus,
        playerStatus: ensured.playerStatus,
      });
      return logEnsureBlocked(tournamentId, message, "resolveTournamentTableForJoin:not_navigate_ready", tournament, {
        source,
      });
    }
    return {
      ok: true,
      tournament: { ...tournament, tableId, roomId },
      tableId,
      roomId,
      buyInCents: tournament.startingStackCents,
    };
  } catch (e: unknown) {
    const apiError = e instanceof ApiError ? e : null;
    const raw = apiError?.message ?? (e instanceof Error ? e.message : "Could not open tournament table");
    const message = mapTournamentApiError(raw, apiError?.code);
    logTournamentJoinBlockedClient({
      tournamentId,
      reason: message,
      sourceFunction: "resolveTournamentTableForJoin:exception",
      extra: ensureBlockedLogExtra(source, { raw }, apiError),
    });
    return { ok: false, message };
  }
}
