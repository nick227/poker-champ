/**
 * Returns TableSceneShell slot props for idle (between hands) state.
 * When snapshot is null returns placeholder slots so hook can run unconditionally.
 */
import type { ReactNode } from "react";
import { View } from "react-native";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { TablePageController } from "@/types/tableSceneContract";
import type { TableSceneShellProps } from "../table-layout";
import type { Opponent } from "../opponent-strip";
import { HeroZone } from "../hero-zone";
import { MeasuredBoundsReporter } from "../board-area";
import { TableStatusStrip } from "../action-bar/TableStatusStrip";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { RejoinCTA, type RejoinUiState } from "../RejoinCTA";
import { useTableViewShellFrame } from "./tableView.shared";
import { getPlaceholderSlots } from "./tableSceneSlots";
import type { LiveTableSlotState } from "./useActiveTableSlots";
import { isTournamentEliminatedSpectator } from "@/features/table/lib/tournament-spectator";

function renderStatusStripPanel(
  message: string,
  showSpinner: boolean,
  showTurnCue: boolean,
) {
  return (
    <View
      style={{ flex: 1, width: "100%", justifyContent: "flex-start" }}
      className="ui-p-inline-4 pt-2"
    >
      <TableStatusStrip
        message={message}
        showSpinner={showSpinner}
        showTurnCue={showTurnCue}
      />
    </View>
  );
}

export function useIdleTableSlots(
  snapshot: TableSnapshotPayload | null,
  _scene: TablePageController["scene"],
  renderModel: TablePageController["renderModel"],
  actions: TablePageController["actions"],
  emptyOpponentsState: ReactNode,
  liveTableState?: LiveTableSlotState,
): TableSceneShellProps {
  const statusStrip = liveTableState?.statusStrip;
  const { model, shellBaseProps, board } = useTableViewShellFrame({
    snapshot: snapshot ?? null,
    sceneModel: liveTableState?.sceneModel,
    winnerBanner: renderModel.displayEvents.winnerBanner,
    connectionStatus: undefined,
    balanceCents: renderModel.balanceCents,
    topBarRight: renderModel.tableTopBarRight,
    opponents: renderModel.opponents as Opponent[],
    opponentStripEmptyState: emptyOpponentsState,
    onPlayerPress: actions.onPlayerPress,
    onBoardBounds: actions.reportBoardBounds,
    onCardSlotBounds: actions.reportCardSlotBounds,
    onSeatBounds: actions.reportSeatBounds,
    onViewTournamentStandings: actions.openTournamentStandings,
    onBackToLobby: actions.closeTableAndReturn,
    boardCardsOverride: statusStrip?.boardCardsOverride,
    potCentsOverride: statusStrip?.potCentsOverride,
    animateBoardReset: statusStrip?.statusPhase === "boardReset",
  });

  if (!snapshot) {
    return getPlaceholderSlots(renderModel.balanceCents, renderModel.tableTopBarRight) as TableSceneShellProps;
  }

  const { heroStatus, heroStackCents, heroCards } = model;
  const heroIsSeated = snapshot.hero.youAreSeated;
  const hasActiveHand = Boolean(snapshot.hand);
  const tournamentSpectator = isTournamentEliminatedSpectator(snapshot);
  const isSpectator = !heroIsSeated && !hasActiveHand && !tournamentSpectator;
  const heroIsSittingOut = heroIsSeated && heroStatus === "SITTING_OUT" && !!actions.rejoinHero;
  const rejoinState = (renderModel.rejoinUiState ?? "idle") as RejoinUiState;
  const rejoinErrorMessage = renderModel.rejoinErrorMessage ?? null;

  let bottom: ReactNode;
  if (heroIsSittingOut) {
    bottom = (
      <RejoinCTA
        state={rejoinState}
        errorMessage={rejoinErrorMessage}
        onPressRejoin={actions.rejoinHero}
        onBackToLobby={actions.closeTableAndReturn}
        isFatalTableGone={Boolean(rejoinErrorMessage && /table no longer exists|table_gone/i.test(rejoinErrorMessage))}
      />
    );
  } else if (renderModel.canRebuy && actions.openRebuySheet) {
    bottom = <Button title="Rebuy" onPress={actions.openRebuySheet} />;
  } else if (tournamentSpectator) {
    bottom = (
      <View className="ui-p-inline-4 gap-y-2">
        <Text className="text-center">Spectating this tournament table.</Text>
        <View className="ui-row gap-x-2 justify-center">
          <Button title="View standings" onPress={actions.openTournamentStandings} />
          <Button title="Back to lobby" variant="ghost" onPress={actions.closeTableAndReturn} />
        </View>
      </View>
    );
  } else if (isSpectator) {
    bottom = (
      <View className="ui-p-inline-4 gap-y-2">
        <Text className="text-center">You are not seated at this table.</Text>
        <View className="ui-row gap-x-2 justify-center">
          {actions.joinTableFromFallback ? (
            <Button title="Join table" onPress={actions.joinTableFromFallback} />
          ) : null}
          <Button title="Back to lobby" onPress={actions.closeTableAndReturn} />
        </View>
      </View>
    );
  } else {
    bottom = renderStatusStripPanel(
      statusStrip?.message ?? "",
      statusStrip?.showSpinner ?? false,
      statusStrip?.showTurnCue ?? false,
    );
  }

  const heroUserName = snapshot.seats.find((s) => s.seat === snapshot.hero.seat)?.name;

  return {
    ...shellBaseProps,
    dealerBar: null,
    board,
    onSeatBounds: actions.reportSeatBounds,
    hero: (
      <MeasuredBoundsReporter onBounds={actions.reportHeroBounds}>
        <HeroZone
          cards={heroCards}
          stackCents={heroStackCents}
          canAct={false}
          heroStatus={heroStatus}
          showStats={snapshot.table?.showStats ?? false}
          userName={heroUserName}
        />
      </MeasuredBoundsReporter>
    ),
    bottom,
    rootClassName: "overflow-hidden",
    immersiveBoard: false,
  };
}
