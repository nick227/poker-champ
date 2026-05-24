import type { Router } from "expo-router";
import { loginPathWithNext, tablePath } from "@/lib/nav";
import {
  isNotFoundJoinMessage,
  logTableOpenTarget,
  logTournamentJoinBlockedClient,
  logTournamentJoinClick,
  logTournamentRegisterRequest,
  snapshotTournamentForJoinLog,
} from "@/lib/tournamentJoinDiagnostics";
import { mapTournamentApiError, resolveTournamentCta } from "@/lib/tournament.utils";
import { resolveTournamentTableForJoin } from "@/lib/tournamentEnsureJoin";
import { postTournamentRegister, postTournamentUnregister } from "@/services/post/tournaments.post";
import type { TournamentSummary } from "@/services/tournaments.types";

export type TournamentActionHandlers = {
  router: Router;
  authenticated: boolean;
  actionInFlight: boolean;
  setActionInFlight: (busy: boolean) => void;
  showToast: (message: string, tone: "success" | "danger") => void;
  onRequestRegister: (tournament: TournamentSummary) => void;
  onRequestJoin: (tournament: TournamentSummary) => void;
  onRequestStandings?: (tournament: TournamentSummary) => void;
  openTable: (tableId: string, joinState?: { buyInCents: number; tournamentId?: string }) => void;
  setRoomForTable: (tableId: string, roomId: string) => void;
  refreshTournament: () => void;
  refreshBankroll: () => void;
  loginReturnPath: string;
  /** Latest lobby/detail list row for stale-click audits. */
  lookupTournament?: (tournamentId: string) => TournamentSummary | undefined;
  joinSource?: string;
};

export function confirmTournamentTableJoin(
  tournament: TournamentSummary,
  handlers: Pick<TournamentActionHandlers, "openTable" | "router" | "setRoomForTable" | "showToast">,
  targets: { tableId: string; roomId: string; buyInCents: number },
  source = "tournament_lobby",
): boolean {
  const tableId = targets.tableId;
  const roomId = targets.roomId;
  if (!tableId || !roomId) {
    logTournamentJoinBlockedClient({
      tournamentId: tournament.id,
      reason: "missing_table_or_room_target",
      sourceFunction: "confirmTournamentTableJoin",
      tournamentSnapshot: snapshotTournamentForJoinLog(tournament),
      extra: { tableId: tableId || null, roomId: roomId || null, source },
    });
    return false;
  }
  const buyInCents = targets.buyInCents;
  logTableOpenTarget({
    tournamentId: tournament.id,
    tableId,
    roomId,
    source,
  });
  handlers.setRoomForTable(tableId, roomId);
  handlers.openTable(tableId, { buyInCents, tournamentId: tournament.id });
  handlers.router.push(tablePath(tableId, { buyInCents }));
  return true;
}

export async function executeTournamentTableJoin(
  tournament: TournamentSummary,
  handlers: Pick<
    TournamentActionHandlers,
    "openTable" | "router" | "setRoomForTable" | "showToast" | "refreshTournament"
  >,
  options?: { source?: string; clickedSnapshot?: TournamentSummary },
): Promise<boolean> {
  const source = options?.source ?? "lobby_cta";
  const clicked = options?.clickedSnapshot ?? tournament;
  const resolved = await resolveTournamentTableForJoin(tournament.id, source);
  if (!resolved.ok) {
    if (isNotFoundJoinMessage(resolved.message)) {
      logTournamentJoinBlockedClient({
        tournamentId: tournament.id,
        reason: resolved.message,
        sourceFunction: "executeTournamentTableJoin",
        tournamentSnapshot: snapshotTournamentForJoinLog(clicked),
        extra: { ensureSource: source },
      });
    }
    handlers.showToast(resolved.message, "danger");
    return false;
  }
  handlers.refreshTournament();
  return confirmTournamentTableJoin(
    resolved.tournament,
    handlers,
    {
      tableId: resolved.tableId,
      roomId: resolved.roomId,
      buyInCents: resolved.buyInCents,
    },
    source === "lobby_cta" ? "tournament_lobby" : source,
  );
}

export async function confirmTournamentRegister(
  tournamentId: string,
  handlers: Pick<TournamentActionHandlers, "showToast" | "refreshTournament" | "refreshBankroll">,
  source = "register_modal",
): Promise<boolean> {
  try {
    logTournamentRegisterRequest(tournamentId, source);
    await postTournamentRegister(tournamentId);
    handlers.showToast("Registered for tournament", "success");
    handlers.refreshTournament();
    handlers.refreshBankroll();
    return true;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Registration failed";
    if (isNotFoundJoinMessage(message)) {
      logTournamentJoinBlockedClient({
        tournamentId,
        reason: message,
        sourceFunction: "confirmTournamentRegister",
        extra: { source },
      });
    }
    handlers.showToast(mapTournamentApiError(message), "danger");
    return false;
  }
}

export function dispatchTournamentCta(
  tournament: TournamentSummary,
  handlers: TournamentActionHandlers,
): void {
  const nowMs = Date.now();
  const cta = resolveTournamentCta(tournament, { authenticated: handlers.authenticated, nowMs });
  const storeRow = handlers.lookupTournament?.(tournament.id);
  logTournamentJoinClick(tournament, cta, nowMs, storeRow);

  if (handlers.actionInFlight) {
    if (cta.action === "join" || cta.action === "spectate" || cta.action === "rebuy") {
      logTournamentJoinBlockedClient({
        tournamentId: tournament.id,
        reason: "action_in_flight",
        sourceFunction: "dispatchTournamentCta",
        tournamentSnapshot: snapshotTournamentForJoinLog(tournament),
      });
    }
    return;
  }

  if (!handlers.authenticated && (cta.action === "register" || cta.action === "join" || cta.action === "spectate" || cta.action === "rebuy")) {
    handlers.router.push(loginPathWithNext(handlers.loginReturnPath));
    return;
  }

  if (cta.action === "none" || cta.disabled) {
    if (cta.action === "join" || (cta.action === "none" && tournament.status === "RUNNING")) {
      logTournamentJoinBlockedClient({
        tournamentId: tournament.id,
        reason: cta.disabled ? "cta_disabled" : "cta_none",
        sourceFunction: "dispatchTournamentCta",
        tournamentSnapshot: snapshotTournamentForJoinLog(tournament),
        extra: { ctaLabel: cta.label, ctaAction: cta.action },
      });
    }
    return;
  }

  if (cta.action === "register") {
    handlers.onRequestRegister(tournament);
    return;
  }

  if (cta.action === "unregister") {
    handlers.setActionInFlight(true);
    void postTournamentUnregister(tournament.id)
      .then(() => {
        handlers.showToast("Unregistered from tournament", "success");
        handlers.refreshTournament();
        handlers.refreshBankroll();
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "Unregister failed";
        handlers.showToast(mapTournamentApiError(message), "danger");
      })
      .finally(() => handlers.setActionInFlight(false));
    return;
  }

  if (cta.action === "join" || cta.action === "spectate" || cta.action === "rebuy") {
    handlers.setActionInFlight(true);
    const joinSource = handlers.joinSource ?? "lobby_cta";
    void executeTournamentTableJoin(tournament, handlers, {
      source: joinSource,
      clickedSnapshot: tournament,
    }).finally(() => handlers.setActionInFlight(false));
    return;
  }

  if (cta.action === "standings") {
    handlers.onRequestStandings?.(tournament);
  }
}
