/**
 * Returns TableSceneShell slot props for active (in-hand) state.
 * When snapshot is null returns placeholder slots so hook can run unconditionally.
 */
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";
import { View } from "react-native";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { TablePageController } from "@/types/tableSceneContract";
import type { TableSceneModel } from "../model/useTableSceneModel";
import type { TableSceneShellProps } from "../table-layout";
import type { Opponent } from "../opponent-strip";
import { HeroZone } from "../hero-zone";
import { ActionBar, type ActionBarOnAction } from "../action-bar";
import { TableStatusStrip } from "../action-bar/TableStatusStrip";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { RejoinCTA } from "../RejoinCTA";
import { useTableViewShellFrame } from "./tableView.shared";
import { useTurnCountdown, useTurnProgress } from "../hooks/useTurnCountdown";
import { getPlaceholderSlots } from "./tableSceneSlots";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import type { LiveTableStatusStripState } from "@/features/table-page/useLiveTableStatusStripState";

export type LiveTableSlotState = {
  sceneModel?: TableSceneModel;
  statusStrip?: LiveTableStatusStripState;
};

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

export function useActiveTableSlots(
  snapshot: TableSnapshotPayload | null,
  scene: TablePageController["scene"],
  renderModel: TablePageController["renderModel"],
  actions: TablePageController["actions"],
  emptyOpponentsState: ReactNode,
  heroAvatarUrl?: string | null,
  liveTableState?: LiveTableSlotState,
): TableSceneShellProps {
  const prevHandIdRef = useRef<string | null>(null);
  const prevRevealedBoardCardsRef = useRef<number | null>(null);

  const opponents = (renderModel.opponents ?? []) as Opponent[];
  const statusStrip = liveTableState?.statusStrip;
  const { model, shellBaseProps, board } = useTableViewShellFrame({
    snapshot: snapshot ?? null,
    sceneModel: liveTableState?.sceneModel,
    winnerBanner: renderModel.displayEvents.winnerBanner,
    connectionStatus: scene.connectionStatus,
    balanceCents: renderModel.balanceCents,
    topBarRight: renderModel.tableTopBarRight,
    opponents,
    opponentStripEmptyState: emptyOpponentsState,
    onPlayerPress: actions.onPlayerPress,
    onBoardBounds: actions.reportBoardBounds,
    onCardSlotBounds: actions.reportCardSlotBounds,
    onSeatBounds: actions.reportSeatBounds,
    boardCardsOverride: statusStrip?.boardCardsOverride,
    potCentsOverride: statusStrip?.potCentsOverride,
    animateBoardReset: statusStrip?.statusPhase === "boardReset",
  });

  const {
    actionContext,
    canAct,
    heroStatus,
    communityCards,
    heroCards,
    heroStackCents,
    heroActionOptions,
    heroCalculations,
    heroPlayerStats,
    heroName,
    heroAvatarUrl: modelHeroAvatarUrl,
    isHeroToAct,
    isHeroWinner,
    isHeroDealer,
    potCents,
  } = model;

  const turnDeadlineMs = snapshot?.hand?.turnDeadlineMs;
  const turnTimeoutTotalMs = snapshot?.hand?.turnTimeoutTotalMs;
  const turnCountdownSeconds = useTurnCountdown(
    isHeroToAct,
    true,
    turnDeadlineMs,
    turnTimeoutTotalMs,
  );
  const hasOpponentToAct = opponents.some((o) => o.isActive);
  const activeTurnProgress = useTurnProgress(hasOpponentToAct, true, turnTimeoutTotalMs);

  const heroIsSeated = snapshot?.hero.youAreSeated ?? false;
  const waitingBetweenHands = statusStrip
    ? statusStrip.statusPhase === "betweenHands"
    : !snapshot?.hand;
  const showHeroActionBar = actionContext.showActions;

  const handleAction: ActionBarOnAction = useCallback(
    (payload) => {
      actions.sendAction(payload);
    },
    [actions],
  );

  useEffect(() => {
    const handId = snapshot?.hand?.handId ?? null;
    const prev = prevHandIdRef.current;
    if (prev === null) {
      prevHandIdRef.current = handId;
      return;
    }
    if (handId != null && handId !== prev) {
      emitSoundEvent("table.handStart");
    }
    prevHandIdRef.current = handId;
  }, [snapshot?.hand?.handId]);

  useEffect(() => {
    const revealedCount = communityCards.reduce((count, card) => (card ? count + 1 : count), 0);
    const prev = prevRevealedBoardCardsRef.current;
    if (prev === null) {
      prevRevealedBoardCardsRef.current = revealedCount;
      return;
    }
    if (revealedCount > prev) {
      emitSoundEvent("table.boardReveal");
    }
    prevRevealedBoardCardsRef.current = revealedCount;
  }, [communityCards]);

  if (!snapshot) {
    return getPlaceholderSlots(renderModel.balanceCents, renderModel.tableTopBarRight) as TableSceneShellProps;
  }

  const heroIsSittingOut =
    heroIsSeated && heroStatus === "SITTING_OUT" && !!actions.rejoinHero;
  const rejoinState = renderModel.rejoinUiState ?? "idle";
  const rejoinErrorMessage = renderModel.rejoinErrorMessage ?? null;

  let bottom: ReactNode;
  if (!heroIsSeated) {
    bottom = (
      <View className="ui-p-inline-4 gap-y-2">
        <Text className="text-center">You are not seated at this table.</Text>
        <View className="ui-row gap-x-2 justify-center">
          {actions.joinTableFromFallback ? (
            <Button title="Join table" onPress={actions.joinTableFromFallback} />
          ) : null}
          {actions.closeTableAndReturn ? (
            <Button title="Back to lobby" onPress={actions.closeTableAndReturn} variant="ghost" />
          ) : null}
        </View>
      </View>
    );
  } else if (heroIsSittingOut) {
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
  } else if (!waitingBetweenHands && showHeroActionBar) {
    bottom = (
      <ActionBar
        actionContext={actionContext}
        heroStatus={heroStatus}
        actionOptions={heroActionOptions}
        potCents={potCents}
        statusMessage={statusStrip?.message ?? ""}
        showStatusSpinner={statusStrip?.showSpinner}
        showTurnCue={statusStrip?.showTurnCue}
        hideReconnectingOverlay
        onAction={handleAction}
        forceInteractive={false}
      />
    );
  } else {
    bottom = renderStatusStripPanel(
      statusStrip?.message ?? "",
      statusStrip?.showSpinner ?? false,
      statusStrip?.showTurnCue ?? false,
    );
  }

  const heroNode = (
    <HeroZone
      cards={heroCards}
      stackCents={heroStackCents}
      canAct={statusStrip?.showTurnCue ?? canAct}
      heroStatus={heroStatus}
      equity={heroCalculations?.equityPct}
      potOdds={heroCalculations?.potOddsPct}
      outs={heroCalculations?.outs}
      playerStats={heroPlayerStats}
      showStats={snapshot.table?.showStats ?? false}
      isWinner={isHeroWinner}
      isDealer={isHeroDealer}
      isActiveTurn={statusStrip?.showTurnCue ?? isHeroToAct}
      turnCountdownSeconds={
        statusStrip?.showTurnCue ? (turnCountdownSeconds ?? undefined) : undefined
      }
      userName={heroName}
      avatarUrl={heroAvatarUrl ?? modelHeroAvatarUrl ?? undefined}
      potCents={potCents}
      onAvatarPress={undefined}
      onToggleSittingOut={actions.toggleHeroSittingOut}
    />
  );

  return {
    ...shellBaseProps,
    activeTurnProgress,
    dealerBar: null,
    board,
    onSeatBounds: actions.reportSeatBounds,
    hero: heroNode,
    bottom,
    rootClassName: "overflow-hidden",
    immersiveBoard: false,
  };
}
