import { View, ScrollView } from "react-native";
import { Screen } from "@/components/containers/Screen";
import { Masthead } from "@/features/lobby";
import { AppTopNav } from "@/components/domain/navigation/AppTopNav";
import { HeaderStack } from "@/components/containers/HeaderStack";
import { InstantGamePanels } from "@/features/lobby";
import { ReplayQuickLinks } from "@/features/lobby";
import { LobbyModeRow } from "@/features/lobby";
import { LobbyDesktopLayout } from "@/features/lobby";
import { LobbyDesktopToolbar } from "@/features/lobby";
import { LobbyContinuePlaying } from "@/features/lobby";
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

  const modeRow = (
    <LobbyModeRow
      active={m.activeTab}
      onChange={m.setActiveTab}
      tournamentsBadgeCount={m.joinedTournamentsCount}
      createLabel={m.createModeLabel}
      onCreate={m.onModeCreate}
      dense
    />
  );

  const cashListStage = (
    <LobbyCashListStage
      busy={m.busy}
      error={m.error}
      tables={m.sortedTables}
      balanceCents={m.bankroll}
      filters={m.filters}
      sortKey={m.sortKey}
      sortDir={m.sortDir}
      onSort={m.handleSort}
      isJoining={m.isJoining}
      onJoin={m.openJoinModal}
      onRetry={() => {
        void m.refresh();
      }}
      onCreate={m.openCreateTable}
      onClearFilters={m.clearFilters}
      scrollable={m.isDesktopWorkspace}
      compact={!m.isDesktopWorkspace}
    />
  );

  const tournamentPrimary = (
    <LobbyTournamentPrimary
      tournaments={m.tournamentList}
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
    />
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
      onlineSheetVisible={m.onlineSheetVisible}
      onCloseOnline={() => m.setOnlineSheetVisible(false)}
      onlinePlayers={m.onlinePlayers}
      onlineBusy={m.onlineBusy}
      onlineError={m.onlineError}
      onRefreshOnline={m.requestOnlinePlayers}
    />
  );

  if (m.isDesktopWorkspace) {
    return (
      <Screen>
        <LobbyDesktopLayout
          username={m.profile.username ?? "Player"}
          amountCents={m.bankroll}
          onlineLabel={m.onlineLabel}
          onPressOnline={m.openOnlineSheet}
          avatarUrl={m.profile.avatarUrl}
          authenticated={m.authenticated}
          primary={
            <View className="flex-1 min-h-0">
              {lessonNudge}
              <LobbyContinuePlaying variant="row" />
              {modeRow}
              {m.activeTab === "tournaments" ? (
                tournamentPrimary
              ) : (
                <>
                  <InstantGamePanels
                    inFlightPreset={m.instantStartInFlightPreset}
                    onStart={m.handleStartInstantGame}
                  />
                  <LobbyDesktopToolbar
                    filters={m.filters}
                    onFiltersChange={m.updateFilters}
                    tableCount={m.sortedTables.length}
                  />
                  {cashListStage}
                </>
              )}
            </View>
          }
        />
        {modals}
      </Screen>
    );
  }

  return (
    <Screen>
      <HeaderStack>
        <Masthead />
        <AppTopNav
          username={m.profile.username ?? "Player"}
          onlineLabel={m.onlineLabel}
          onPressOnline={m.openOnlineSheet}
          amountCents={m.bankroll}
          avatarUrl={m.profile.avatarUrl}
        />
      </HeaderStack>
      {lessonNudge ? <View className="mx-4 mt-2">{lessonNudge}</View> : null}
      <ScrollView className="flex-1">
        <LobbyContinuePlaying />
        <LobbyModeRow
          active={m.activeTab}
          onChange={m.setActiveTab}
          tournamentsBadgeCount={m.joinedTournamentsCount}
          createLabel={m.createModeLabel}
          onCreate={m.onModeCreate}
        />
        {m.activeTab === "cash" ? (
          <>
            <InstantGamePanels
              padded
              inFlightPreset={m.instantStartInFlightPreset}
              onStart={m.handleStartInstantGame}
            />
            <LobbyDesktopToolbar
              padded
              filters={m.filters}
              onFiltersChange={m.updateFilters}
              tableCount={m.sortedTables.length}
            />
            <View className="px-4 pb-4">{cashListStage}</View>
          </>
        ) : (
          tournamentPrimary
        )}
        <ReplayQuickLinks
          lessonsEnabled
          onPokerSchool={() => m.router.push("/lessons")}
        />
      </ScrollView>
      {modals}
    </Screen>
  );
}
