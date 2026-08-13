import { View } from "react-native";
import { LobbyPageHeader } from "../components/lobby/LobbyPageHeader";
import { LobbyPageShell } from "../components/lobby/LobbyPageShell";
import { LobbyTournamentPrimary } from "../components/lobby/LobbyTournamentPrimary";
import { useLobbyScreenModel } from "../hooks/useLobbyScreenModel";
import { usePageBoot } from "@/hooks/usePageBoot";
import { useAuthStore } from "@/stores/auth.store";

export function LobbyTournamentsBrowseScreen() {
  const m = useLobbyScreenModel();
  const authHydrated = useAuthStore((s) => s.hydrated);
  const ready = usePageBoot(authHydrated && !m.busy && !m.tournamentsBusy, {
    busy: m.busy || m.tournamentsBusy,
  });
  const padded = !m.isDesktopWorkspace;
  const compact = !m.isDesktopWorkspace;

  return (
    <LobbyPageShell model={m} ready={ready} scroll={false}>
      <View className={`flex-1 min-h-0 ${padded ? "px-4" : ""}`}>
        <LobbyPageHeader title="Tournaments" onCreateTournament={m.handleCreateTournament} />
        <View className="flex-1 min-h-0 pb-4">
          <LobbyTournamentPrimary
            tournaments={m.tournaments}
            busy={m.tournamentsBusy}
            error={m.tournamentsError}
            authenticated={m.authenticated}
            actionInFlight={m.tournamentActionBusy || m.registerBusy}
            onTournamentAction={m.handleTournamentAction}
            onOpenTournamentDetail={m.handleOpenTournamentDetail}
            onRetry={() => {
              void m.refreshTournaments();
            }}
            onCreate={m.handleCreateTournament}
            onDeleteTournament={m.authenticated ? m.handleDeleteTournament : undefined}
            deleteInFlightId={m.tournamentDeleteId}
            dense
            compact={compact}
            scrollable
            sortKey={m.tournamentSortKey}
            sortDir={m.tournamentSortDir}
            onSort={m.handleTournamentSort}
          />
        </View>
      </View>
    </LobbyPageShell>
  );
}
