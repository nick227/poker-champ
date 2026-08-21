import { View } from "react-native";
import { LobbyCashListStage } from "../components/lobby/LobbyCashListStage";
import { LobbyPageHeader } from "../components/lobby/LobbyPageHeader";
import { LobbyPageShell } from "../components/lobby/LobbyPageShell";
import { LobbyQuickActions } from "../components/lobby/LobbyQuickActions";
import { LobbySectionFrame } from "../components/lobby/LobbySectionFrame";
import { LobbySummaryCards } from "../components/lobby/LobbySummaryCards";
import { LobbyTournamentPrimary } from "../components/lobby/LobbyTournamentPrimary";
import { useLobbyScreenModel } from "../hooks/useLobbyScreenModel";
import { computeCashLobbyStats, computeTournamentLobbyStats } from "../lobbySummaryStats";
import { usePageBoot } from "@/hooks/usePageBoot";
import { useAuthStore } from "@/stores/auth.store";

export function LobbyHomeScreen() {
  const m = useLobbyScreenModel();
  const authHydrated = useAuthStore((s) => s.hydrated);
  const ready = usePageBoot(authHydrated && !m.busy && !m.tournamentsBusy, {
    busy: m.busy || m.tournamentsBusy,
  });
  const padded = !m.isDesktopWorkspace;
  const compact = !m.isDesktopWorkspace;
  const cashStats = computeCashLobbyStats([...m.pinnedCashTables, ...m.sortedTables]);
  const tourneyStats = computeTournamentLobbyStats(m.tournaments);

  return (
    <LobbyPageShell model={m} ready={ready}>
      <View className={`pb-5 ${padded ? "px-4" : ""}`}>
        <LobbyPageHeader
          title="Poker Champ"
          compact={compact}
        />
        <LobbyQuickActions
          onCreateTournament={m.handleCreateTournament}
          onQuickStart={m.openCreateTable}
          onLeaderboard={() => m.router.push("/leaderboard")}
          onTraining={() => m.router.push("/lessons")}
        />
        <LobbySummaryCards
          tablesLive={cashStats.tablesLive}
          seatsAvailable={cashStats.seatsAvailable}
          upcomingEvents={tourneyStats.upcomingEvents}
          playersRegistered={tourneyStats.playersRegistered}
          compact={compact}
        />
        <View className="mt-4">
          <LobbySectionFrame title="Cash games" accent="brand">
            <LobbyCashListStage
              busy={m.busy}
              error={m.error}
              tables={m.sortedTables}
              pinnedTables={m.pinnedCashTables}
              sortKey={m.sortKey}
              sortDir={m.sortDir}
              onSort={m.handleSort}
              isJoining={m.isJoining}
              onJoin={m.openJoinModal}
              onResume={m.resumeCashTable}
              onWatch={m.watchCashTable}
              onRetry={() => {
                void m.refresh();
              }}
              onCreate={m.openCreateTable}
              scrollable={false}
              compact={compact}
              embedded
            />
          </LobbySectionFrame>
        </View>
        <View className="mt-4">
          <LobbySectionFrame title="Tournaments" accent="gold">
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
              embedded
              sortKey={m.tournamentSortKey}
              sortDir={m.tournamentSortDir}
              onSort={m.handleTournamentSort}
            />
          </LobbySectionFrame>
        </View>
      </View>
    </LobbyPageShell>
  );
}
