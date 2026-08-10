import { View, ScrollView } from "react-native";
import { Screen } from "@/components/containers/Screen";
import { ReplayQuickLinks } from "@/features/lobby";
import { LobbyDesktopToolbar } from "@/features/lobby";
import { LobbyActionRow } from "@/features/lobby/components/lobby/LobbyActionRow";
import { LobbyCashListStage } from "@/features/lobby/components/lobby/LobbyCashListStage";
import { LobbyLessonNudge } from "@/features/lobby/components/lobby/LobbyLessonNudge";
import { LobbyScreenModals } from "@/features/lobby/components/lobby/LobbyScreenModals";
import { LobbyTournamentPrimary } from "@/features/lobby/components/lobby/LobbyTournamentPrimary";
import { useLobbyScreenModel } from "@/features/lobby/hooks/useLobbyScreenModel";

export default function LobbyScreen() {
  const m = useLobbyScreenModel();

  const lessonNudge = m.showFromLessonNudge ? (
    <LobbyLessonNudge
      onPlay={m.playFromLesson}
      onDismiss={m.dismissLessonNudge}
      showPlayCta={m.isDesktopWorkspace}
    />
  ) : null;

  const actionRow = (
    <LobbyActionRow
      inFlightPreset={m.instantStartInFlightPreset}
      onStart={m.handleStartInstantGame}
      onNew={m.handleNew}
    />
  );

  const toolbar = (
    <LobbyDesktopToolbar
      mode={m.contentMode}
      onModeChange={m.setContentMode}
      tournamentsBadgeCount={m.joinedTournamentsCount}
      filters={m.filters}
      onFiltersChange={m.updateFilters}
      resultLabel={m.resultLabel}
    />
  );

  const cashListStage = (
    <LobbyCashListStage
      busy={m.busy}
      error={m.error}
      tables={m.sortedTables}
      pinnedTables={m.pinnedCashTables}
      filters={m.filters}
      sortKey={m.sortKey}
      sortDir={m.sortDir}
      onSort={m.handleSort}
      isJoining={m.isJoining}
      onJoin={m.openJoinModal}
      onResume={m.resumeCashTable}
      onRetry={() => {
        void m.refresh();
      }}
      onCreate={m.openCreateTable}
      onClearFilters={m.clearFilters}
      scrollable={m.isDesktopWorkspace && m.contentMode === "cash"}
      compact={!m.isDesktopWorkspace}
    />
  );

  const tournamentPrimary = (
    <LobbyTournamentPrimary
      tournaments={m.filteredTournaments}
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
      dense={m.isDesktopWorkspace}
      scrollable={m.isDesktopWorkspace && m.contentMode === "tournaments"}
    />
  );

  const listStage = (
    <>
      {m.showCash ? cashListStage : null}
      {m.showCash && m.showTournaments ? <View className="h-5" /> : null}
      {m.showTournaments ? tournamentPrimary : null}
    </>
  );

  const modals = (
    <LobbyScreenModals
      createModalVisible={m.createModalVisible}
      onCloseCreate={() => m.setCreateModalVisible(false)}
      onSubmitCreate={m.handleCreateGame}
      tournamentCreateVisible={m.tournamentCreateModalVisible}
      onCloseTournamentCreate={() => m.setTournamentCreateModalVisible(false)}
      onTournamentCreated={() => {
        void m.refreshTournaments();
      }}
      registerTournament={m.registerModalTournament}
      bankroll={m.bankroll}
      registerBusy={m.registerBusy}
      onCloseRegister={() => m.setRegisterModalTournament(null)}
      onConfirmRegister={() => void m.handleConfirmTournamentRegister()}
      joinTournament={m.joinModalTournament}
      tournamentActionBusy={m.tournamentActionBusy}
      onCloseJoin={() => m.setJoinModalTournament(null)}
      onConfirmJoin={m.handleConfirmTournamentJoin}
      standings={m.standingsModal}
      onCloseStandings={() => m.setStandingsModal(null)}
      chooseTable={m.chooseTableModal}
      onCloseChoose={() => m.setChooseTableModal(null)}
      onApplyJoin={m.handleJoinApply}
    />
  );

  if (m.isDesktopWorkspace) {
    return (
      <Screen>
        <View className="flex-1 min-h-0">
          {lessonNudge}
          {actionRow}
          {toolbar}
          {m.contentMode === "all" ? (
            <ScrollView className="flex-1 min-h-0">{listStage}</ScrollView>
          ) : (
            <View className="flex-1 min-h-0">{listStage}</View>
          )}
        </View>
        {modals}
      </Screen>
    );
  }

  return (
    <Screen>
      {lessonNudge ? <View className="mx-4 mt-2">{lessonNudge}</View> : null}
      <ScrollView className="flex-1">
        <LobbyActionRow
          padded
          inFlightPreset={m.instantStartInFlightPreset}
          onStart={m.handleStartInstantGame}
          onNew={m.handleNew}
        />
        <LobbyDesktopToolbar
          padded
          mode={m.contentMode}
          onModeChange={m.setContentMode}
          tournamentsBadgeCount={m.joinedTournamentsCount}
          filters={m.filters}
          onFiltersChange={m.updateFilters}
          resultLabel={m.resultLabel}
        />
        <View className="px-4 pb-4">{listStage}</View>
        <ReplayQuickLinks
          lessonsEnabled
          onPokerSchool={() => m.router.push("/lessons")}
        />
      </ScrollView>
      {modals}
    </Screen>
  );
}
