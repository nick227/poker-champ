import type { Router } from "expo-router";
import { loginPathWithNext, tablePath } from "@/lib/nav";
import { mapTournamentApiError, resolveTournamentCta } from "@/lib/tournament.utils";
import { postTournamentRegister, postTournamentUnregister } from "@/services/post/tournaments.post";
import type { TournamentSummary } from "@/services/tournaments.types";

export type TournamentActionHandlers = {
  router: Router;
  authenticated: boolean;
  actionInFlight: boolean;
  setActionInFlight: (busy: boolean) => void;
  showToast: (message: string, tone: "success" | "danger") => void;
  onRequestRegister: (tournament: TournamentSummary) => void;
  onRequestStandings?: (tournament: TournamentSummary) => void;
  openTable: (tableId: string) => void;
  refreshTournament: () => void;
  refreshBankroll: () => void;
  loginReturnPath: string;
};

export async function confirmTournamentRegister(
  tournamentId: string,
  handlers: Pick<TournamentActionHandlers, "showToast" | "refreshTournament" | "refreshBankroll">,
): Promise<boolean> {
  try {
    await postTournamentRegister(tournamentId);
    handlers.showToast("Registered for tournament", "success");
    handlers.refreshTournament();
    handlers.refreshBankroll();
    return true;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Registration failed";
    handlers.showToast(mapTournamentApiError(message), "danger");
    return false;
  }
}

export function dispatchTournamentCta(
  tournament: TournamentSummary,
  handlers: TournamentActionHandlers,
): void {
  if (handlers.actionInFlight) return;

  const cta = resolveTournamentCta(tournament, { authenticated: handlers.authenticated });
  if (cta.action === "none" || cta.disabled) return;

  if (!handlers.authenticated && cta.action !== "standings") {
    handlers.router.push(loginPathWithNext(handlers.loginReturnPath));
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

  if (cta.action === "join" && tournament.tableId) {
    handlers.openTable(tournament.tableId);
    handlers.router.push(tablePath(tournament.tableId));
    return;
  }

  if (cta.action === "standings") {
    handlers.onRequestStandings?.(tournament);
  }
}
