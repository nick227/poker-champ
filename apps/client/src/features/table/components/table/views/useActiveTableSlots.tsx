/**
 * Returns TableSceneShell slot props for active (in-hand) state.
 * When snapshot is null returns placeholder slots so hook can run unconditionally.
 */
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { TablePageController } from "@/types/tableSceneContract";
import type { TableSceneModel } from "../model/useTableSceneModel";
import type { TableSceneShellProps } from "../table-layout";
import type { Opponent } from "../opponent-strip";
import { ActionBar, type ActionBarOnAction } from "../action-bar";
import { FeltActionAnnounce } from "../FeltActionAnnounce";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { RejoinCTA } from "../RejoinCTA";
import { useTableViewShellFrame } from "./tableView.shared";
import { useTurnCountdown, useTurnProgress } from "../hooks/useTurnCountdown";
import { getPlaceholderSlots } from "./tableSceneSlots";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import { emitHapticEvent } from "@/haptics/emitHapticEvent";
import type { LiveTableStatusStripState } from "@/features/table-page/useLiveTableStatusStripState";
import { isTournamentEliminatedSpectator } from "@/features/table/lib/tournament-spectator";
import { useMultiTableStore } from "@/features/table/stores/multitable.store";
import { EmptyTableStartCta } from "./EmptyTableStartCta";
import { buildHeroPlate } from "../table-stage";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useTableMoneyDisplay } from "@/features/table/context/TableMoneyDisplayContext";

export type LiveTableSlotState = {
  sceneModel?: TableSceneModel;
  statusStrip?: LiveTableStatusStripState;
};

function feltAnnounce(message: string, showSpinner = false) {
  return <FeltActionAnnounce message={message} showSpinner={showSpinner} />;
}

function getOptimisticActionMessage(payload: Parameters<ActionBarOnAction>[0] | null): string {
  switch (payload?.type) {
    case "FOLD":
      return "Folding...";
    case "CHECK":
      return "Checking...";
    case "CALL":
      return "Calling...";
    case "BET":
      return "Betting...";
    case "RAISE":
      return "Raising...";
    case "ALL_IN":
      return "Going all-in...";
    default:
      return "Sending action...";
  }
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
  const [optimisticAction, setOptimisticAction] = useState<Parameters<ActionBarOnAction>[0] | null>(null);
  const optimisticActionRef = useRef<Parameters<ActionBarOnAction>[0] | null>(null);
  const optimisticDispatchRef = useRef<{ handStreet: string | null; snapshotSeq: number | null } | null>(
    null,
  );
  const actionFrameRef = useRef<number | null>(null);
  const prevHandIdRef = useRef<string | null>(null);
  const prevRevealedBoardCardsRef = useRef<number | null>(null);
  const pendingAction = useMultiTableStore(
    (s) => s.pendingActionByTableId[renderModel.tableId],
  );

  const opponents = (renderModel.opponents ?? []) as Opponent[];
  const statusStrip = liveTableState?.statusStrip;
  const cardFacePackId = usePreferencesStore((s) => s.cardFacePackId);
  const { formatStack, formatBet } = useTableMoneyDisplay();
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
    onViewTournamentStandings: actions.openTournamentStandings,
    onBackToLobby: actions.closeTableAndReturn,
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
  const hasOpponentToAct = opponents.some((o) => o.isActive);
  const seatToAct = isHeroToAct || hasOpponentToAct;
  const turnCountdownSeconds = useTurnCountdown(
    seatToAct,
    true,
    turnDeadlineMs,
    turnTimeoutTotalMs,
  );
  const activeTurnProgress = useTurnProgress(seatToAct, true, turnTimeoutTotalMs);

  const heroIsSeated = snapshot?.hero.youAreSeated ?? false;
  const waitingBetweenHands = statusStrip
    ? statusStrip.statusPhase === "betweenHands"
    : !snapshot?.hand;
  const showHeroActionBar = actionContext.showActions;

  const handleAction: ActionBarOnAction = useCallback(
    (payload) => {
      if (optimisticActionRef.current) return;
      optimisticActionRef.current = payload;
      optimisticDispatchRef.current = {
        handStreet: snapshot?.hand?.street ?? null,
        snapshotSeq: snapshot?.snapshotSeq ?? null,
      };
      setOptimisticAction(payload);
      actionFrameRef.current = requestAnimationFrame(() => {
        actionFrameRef.current = null;
        const dispatched = actions.sendAction(payload);
        if (!dispatched) {
          optimisticActionRef.current = null;
          optimisticDispatchRef.current = null;
          setOptimisticAction(null);
        }
      });
    },
    [actions, snapshot?.hand?.street, snapshot?.snapshotSeq],
  );

  useEffect(() => {
    return () => {
      if (actionFrameRef.current != null) {
        cancelAnimationFrame(actionFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!optimisticActionRef.current) return;
    if (!showHeroActionBar || !heroActionOptions || waitingBetweenHands) {
      optimisticActionRef.current = null;
      optimisticDispatchRef.current = null;
      setOptimisticAction(null);
    }
  }, [heroActionOptions, showHeroActionBar, waitingBetweenHands]);

  useEffect(() => {
    if (!optimisticActionRef.current) return;

    const clearOptimistic = () => {
      optimisticActionRef.current = null;
      optimisticDispatchRef.current = null;
      setOptimisticAction(null);
    };

    if (!pendingAction) {
      clearOptimistic();
      return;
    }

    const dispatchCtx = optimisticDispatchRef.current;
    if (!dispatchCtx) return;

    const resolvedActionId = snapshot?.resolvedActionId;
    if (resolvedActionId && resolvedActionId === pendingAction.actionId) {
      clearOptimistic();
      return;
    }

    const handStreet = snapshot?.hand?.street ?? null;
    if (
      dispatchCtx.handStreet != null &&
      handStreet != null &&
      handStreet !== dispatchCtx.handStreet
    ) {
      clearOptimistic();
      return;
    }

    const snapshotSeq = snapshot?.snapshotSeq ?? null;
    if (
      dispatchCtx.snapshotSeq != null &&
      snapshotSeq != null &&
      snapshotSeq > dispatchCtx.snapshotSeq
    ) {
      clearOptimistic();
    }
  }, [
    pendingAction,
    snapshot?.resolvedActionId,
    snapshot?.hand?.street,
    snapshot?.snapshotSeq,
  ]);

  useEffect(() => {
    const handId = snapshot?.hand?.handId ?? null;
    const prev = prevHandIdRef.current;
    if (prev === null) {
      prevHandIdRef.current = handId;
      return;
    }
    if (handId != null && handId !== prev) {
      emitSoundEvent("table.handStart");
      emitHapticEvent("table.cardDeal");
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
      emitHapticEvent("table.cardDeal");
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

  let bottom: ReactNode = null;
  let announceMessage = statusStrip?.message ?? "";
  let announceSpinner = Boolean(statusStrip?.showSpinner);
  const tournamentSpectator = snapshot ? isTournamentEliminatedSpectator(snapshot) : false;
  if (!heroIsSeated && tournamentSpectator) {
    bottom = (
      <View className="ui-p-inline-4 gap-y-2">
        <Text className="text-center">Spectating this tournament table.</Text>
        <View className="ui-row gap-x-2 justify-center">
          <Button title="View standings" onPress={actions.openTournamentStandings} />
          <Button title="Back to lobby" variant="ghost" onPress={actions.closeTableAndReturn} />
        </View>
      </View>
    );
  } else if (renderModel.canRebuy && actions.openRebuySheet) {
    bottom = <Button title="Rebuy" onPress={actions.openRebuySheet} />;
  } else if (!heroIsSeated) {
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
  } else if (optimisticAction) {
    announceMessage = getOptimisticActionMessage(optimisticAction);
    announceSpinner = true;
    bottom = null;
  } else if (!waitingBetweenHands && showHeroActionBar) {
    bottom = (
      <ActionBar
        actionContext={actionContext}
        heroStatus={heroStatus}
        actionOptions={heroActionOptions}
        potCents={potCents}
        hideReconnectingOverlay
        onAction={handleAction}
        forceInteractive={false}
      />
    );
  } else if (renderModel.opponents.length === 0) {
    bottom = (
      <EmptyTableStartCta
        message={statusStrip?.message ?? "Add a bot to start playing"}
        onAddBot={actions.openAddBotPicker}
      />
    );
  } else {
    bottom = null;
  }

  const heroRoundBetCents =
    snapshot?.seats.find((s) => s.seat === snapshot.hero.seat)?.roundBetCents ?? 0;
  const heroPlate = heroIsSeated
    ? buildHeroPlate({
        userName: heroName,
        userId: snapshot?.hero.userId,
        seat: snapshot?.hero.seat ?? undefined,
        stackDisplay: formatStack(heroStackCents),
        avatarUrl: heroAvatarUrl ?? modelHeroAvatarUrl ?? undefined,
        cards: heroCards,
        heroStatus,
        isDealer: isHeroDealer,
        isActiveTurn: statusStrip?.showTurnCue ?? isHeroToAct,
        isWinner: isHeroWinner,
        cardFacePackId,
        betDisplay: heroRoundBetCents > 0 ? formatBet(heroRoundBetCents) : null,
        turnProgress: isHeroToAct ? activeTurnProgress : null,
        turnCountdownSeconds: isHeroToAct ? turnCountdownSeconds : null,
      })
    : null;

  return {
    ...shellBaseProps,
    activeTurnProgress,
    turnCountdownSeconds,
    dealerBar: feltAnnounce(announceMessage, announceSpinner),
    board,
    onSeatBounds: actions.reportSeatBounds,
    onHeroBounds: actions.reportHeroBounds,
    hero: null,
    heroPlate,
    bottom,
    rootClassName: "overflow-hidden",
    immersiveBoard: false,
  };
}
