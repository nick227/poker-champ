import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { Screen } from "@/components/containers/Screen";
import { LobbyLessonNudge } from "./LobbyLessonNudge";
import { LobbyScreenModals } from "./LobbyScreenModals";
import type { useLobbyScreenModel } from "@/features/lobby/hooks/useLobbyScreenModel";

type Model = ReturnType<typeof useLobbyScreenModel>;

type Props = {
  model: Model;
  ready: boolean;
  children: ReactNode;
  scroll?: boolean;
};

export function LobbyPageShell({ model, ready, children, scroll = true }: Props) {
  const padded = !model.isDesktopWorkspace;
  const lessonNudge = model.showFromLessonNudge ? (
    <View className={padded ? "mx-4 mt-2" : "mt-2"}>
      <LobbyLessonNudge
        onPlay={model.playFromLesson}
        onDismiss={model.dismissLessonNudge}
        showPlayCta={model.isDesktopWorkspace}
      />
    </View>
  ) : null;

  const body = (
    <>
      {lessonNudge}
      {children}
    </>
  );

  return (
    <Screen ready={ready}>
      {scroll ? (
        <ScrollView className="flex-1">{body}</ScrollView>
      ) : (
        <View className="flex-1 min-h-0">{body}</View>
      )}
      <LobbyScreenModals
        createModalVisible={model.createModalVisible}
        onCloseCreate={() => model.setCreateModalVisible(false)}
        onSubmitCreate={model.handleCreateGame}
        onInstantStart={model.handleStartInstantGame}
        instantStartInFlight={model.instantStartInFlightPreset}
        tournamentCreateVisible={model.tournamentCreateModalVisible}
        onCloseTournamentCreate={() => model.setTournamentCreateModalVisible(false)}
        onTournamentCreated={() => {
          void model.refreshTournaments();
        }}
        registerTournament={model.registerModalTournament}
        bankroll={model.bankroll}
        registerBusy={model.registerBusy}
        onCloseRegister={() => model.setRegisterModalTournament(null)}
        onConfirmRegister={() => void model.handleConfirmTournamentRegister()}
        joinTournament={model.joinModalTournament}
        tournamentActionBusy={model.tournamentActionBusy}
        onCloseJoin={() => model.setJoinModalTournament(null)}
        onConfirmJoin={model.handleConfirmTournamentJoin}
        standings={model.standingsModal}
        onCloseStandings={() => model.setStandingsModal(null)}
        chooseTable={model.chooseTableModal}
        onCloseChoose={() => model.setChooseTableModal(null)}
        onApplyJoin={model.handleJoinApply}
      />
    </Screen>
  );
}
