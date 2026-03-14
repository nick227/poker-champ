/**
 * Returns TableSceneShell slot props for active (in-hand) state.
 * When snapshot is null returns placeholder slots so hook can run unconditionally.
 */
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { TablePageController } from "@/types/tableSceneContract";
import type { TableSceneShellProps } from "../table-layout";
import type { Opponent } from "../opponent-strip";
import { DealerAnnounceBar } from "../DealerAnnounceBar";
import { HeroZone } from "../hero-zone";
import { ActionBar, type ActionBarOnAction } from "../action-bar";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { RejoinCTA } from "../RejoinCTA";
import { useTableViewShellFrame } from "./tableView.shared";
import { useActiveTableNotification } from "../hooks/useActiveTableNotification";
import { useTurnCountdown, useTurnProgress } from "../hooks/useTurnCountdown";
import { getPlaceholderSlots } from "./tableSceneSlots";
import { emitSoundEvent } from "@/sound/emitSoundEvent";

type ActiveSlotsParams = {
  snapshot: TableSnapshotPayload | null;
  scene: TablePageController["scene"];
  renderModel: TablePageController["renderModel"];
  actions: TablePageController["actions"];
  emptyOpponentsState: ReactNode;
  heroAvatarUrl?: string | null;
};

export function useActiveTableSlots(
  snapshot: TableSnapshotPayload | null,
  scene: TablePageController["scene"],
  renderModel: TablePageController["renderModel"],
  actions: TablePageController["actions"],
  emptyOpponentsState: ReactNode,
  heroAvatarUrl?: string | null,
): TableSceneShellProps {
  const [isPendingHeroAction, setIsPendingHeroAction] = useState(false);
  const prevHandIdRef = useRef<string | null>(null);
  const prevRevealedBoardCardsRef = useRef<number | null>(null);

  const opponents = (renderModel.opponents ?? []) as Opponent[];
  const { model, shellBaseProps, board } = useTableViewShellFrame({
    snapshot: snapshot ?? null,
    handResultMessage: renderModel.handResultMessage ?? null,
    connectionStatus: scene.connectionStatus,
    balanceCents: renderModel.balanceCents,
    topBarRight: renderModel.tableTopBarRight,
    opponents,
    opponentStripEmptyState: emptyOpponentsState,
    onPlayerPress: actions.onPlayerPress,
    onBoardBounds: actions.reportBoardBounds,
    onCardSlotBounds: actions.reportCardSlotBounds,
    onSeatBounds: actions.reportSeatBounds,
  });

  const {
    handSummary,
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
  const waitingBetweenHands = !snapshot?.hand;
  const hasActionOptions = !!heroActionOptions;
  const notification = useActiveTableNotification(
    waitingBetweenHands,
    hasActionOptions,
    actionContext.showActions,
    isPendingHeroAction,
    opponents,
    snapshot ?? ({} as TableSnapshotPayload),
  );

  const handleAction: ActionBarOnAction = useCallback(
    (payload) => {
      setIsPendingHeroAction(true);
      actions.sendAction(payload);
    },
    [actions],
  );

  useEffect(() => {
    if (!actionContext.showActions || !hasActionOptions || waitingBetweenHands) {
      setIsPendingHeroAction(false);
    }
  }, [actionContext.showActions, hasActionOptions, waitingBetweenHands]);

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
  } else if (
    waitingBetweenHands ||
    !hasActionOptions ||
    !actionContext.showActions ||
    isPendingHeroAction
  ) {
    const textVariantClass = {
      default: "text-center text-muted",
      processing: "text-center text-info animate-pulse",
      waiting: "text-center text-warning",
    }[notification.variant];
    bottom = (
      <View className="ui-p-inline-4 gap-y-2">
        <View className="flex-row items-center justify-center gap-x-2">
          {notification.showLoadingIndicator && (
            <ActivityIndicator size="small" className="opacity-70" />
          )}
          <Text className={textVariantClass} numberOfLines={2} ellipsizeMode="tail">
            {notification.message}
          </Text>
        </View>
      </View>
    );
  } else {
    bottom = (
      <ActionBar
        actionContext={actionContext}
        heroStatus={heroStatus}
        actionOptions={heroActionOptions}
        potCents={potCents}
        onAction={handleAction}
        forceInteractive={false}
      />
    );
  }

  const heroNode = (
    <HeroZone
      cards={heroCards}
      stackCents={heroStackCents}
      canAct={canAct}
      heroStatus={heroStatus}
      equity={heroCalculations?.equityPct}
      potOdds={heroCalculations?.potOddsPct}
      outs={heroCalculations?.outs}
      playerStats={heroPlayerStats}
      showStats={snapshot.table?.showStats ?? false}
      isWinner={isHeroWinner}
      isDealer={isHeroDealer}
      isActiveTurn={isHeroToAct}
      turnCountdownSeconds={turnCountdownSeconds ?? undefined}
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
    dealerBar: (
      <DealerAnnounceBar
        hand={handSummary}
        actionMessage={renderModel.actionMessage}
        handResultMessage={renderModel.handResultMessage ?? undefined}
        tableStatus={scene.tableStatus}
        nextHandAtTs={snapshot.nextHandAtTs}
      />
    ),
    board,
    onSeatBounds: actions.reportSeatBounds,
    hero: heroNode,
    bottom,
    rootClassName: "overflow-hidden",
    immersiveBoard: false,
  };
}
