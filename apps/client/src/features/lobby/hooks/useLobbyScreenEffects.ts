import { useEffect } from "react";
import { Platform } from "react-native";
import type { TournamentSummary } from "@/services/tournaments.types";
import { useTournamentStartLobbyEffects } from "@/features/lobby/hooks/useTournamentStartLobbyEffects";

type Params = {
  authHydrated: boolean;
  authToken: string | null;
  refresh: (opts?: { background?: boolean }) => Promise<unknown> | void;
  refreshTournaments: (opts?: { background?: boolean }) => Promise<void> | void;
  tournamentList: TournamentSummary[];
  isDesktopWorkspace: boolean;
  onTournamentCancelled: (t: TournamentSummary) => void;
};

/** Lobby polling, slash-to-search, and tournament start side-effects. */
export function useLobbyScreenEffects({
  authHydrated,
  authToken,
  refresh,
  refreshTournaments,
  tournamentList,
  isDesktopWorkspace,
  onTournamentCancelled,
}: Params) {
  useEffect(() => {
    if (!authHydrated) return;
    void refresh();
    void refreshTournaments();
  }, [authHydrated, refresh, refreshTournaments]);

  useEffect(() => {
    if (!authHydrated) return;
    void refreshTournaments();
  }, [authHydrated, authToken, refreshTournaments]);

  useEffect(() => {
    if (!authHydrated) return;
    const timer = setInterval(() => {
      void refresh({ background: true });
      void refreshTournaments({ background: true });
    }, 30_000);
    return () => clearInterval(timer);
  }, [authHydrated, refresh, refreshTournaments]);

  useTournamentStartLobbyEffects({
    tournaments: tournamentList,
    enabled: authHydrated,
    refreshTournaments: async (opts) => {
      await refreshTournaments(opts);
    },
    onTournamentCancelled,
  });

  useEffect(() => {
    if (!isDesktopWorkspace || Platform.OS !== "web" || typeof document === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
      event.preventDefault();
      document.querySelector<HTMLInputElement>("[data-lobby-search]")?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDesktopWorkspace]);
}
