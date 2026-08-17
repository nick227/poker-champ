import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
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

  // Refetch the authoritative per-viewer table snapshot every time the lobby regains focus, not
  // just on mount + a 30s timer. Joining or leaving a table navigates away from the lobby and
  // back; without this, whichever row the user was sitting at keeps showing the state from
  // *before* that trip (e.g. a table that just filled up because they joined it still reads
  // "not seated" -> "Watch" instead of "Resume", or a table they just left still reads
  // "Resume" until the next poll). The realtime LIST_TABLES broadcast can't fix this itself:
  // it's a shared, unauthenticated snapshot with no per-viewer data (see
  // mergeLobbyTableViewerState in useLobbyRealtime.ts), so only this authenticated HTTP refetch
  // can promote a row's viewer state -- the broadcast can only preserve what's already known.
  // Skip the very first focus (mount already triggers the effect above) to avoid a duplicate
  // fetch on initial load.
  const skippedInitialFocusRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!authHydrated) return;
      if (!skippedInitialFocusRef.current) {
        skippedInitialFocusRef.current = true;
        return;
      }
      void refresh({ background: true });
      void refreshTournaments({ background: true });
    }, [authHydrated, refresh, refreshTournaments]),
  );

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
