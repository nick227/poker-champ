/**
 * collapsable={false} on fixed-height layout shells prevents Yoga from flattening
 * the tree and avoids re-measure jitter on Android/Web. Do not remove.
 */
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { type Opponent } from "../OpponentStrip";
import { HeroZone } from "../HeroZone";
import { DealerAnnounceBar } from "../DealerAnnounceBar";
import { ActionBar, type ActionBarOnAction } from "../ActionBar";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import type { TableSceneModel } from "../model/useTableSceneModel";
import type { ConnectionStatus, HandResultMessage } from "../table.types";
import { TableSceneShell } from "../shell/TableSceneShell";
import { useTableViewShellFrame } from "./tableView.shared";
import { useActiveTableNotification } from "../hooks/useActiveTableNotification";
import { useTurnCountdown, useTurnProgress } from "../hooks/useTurnCountdown";
import { RejoinCTA, type RejoinUiState } from "../RejoinCTA";

export type { Opponent };
export type { HandResultMessage };
export type { ConnectionStatus };

export type ActiveTableViewProps = {
  snapshot: TableSnapshotPayload;
  opponents: Opponent[];
  balanceCents: number;
  tableStatus?: string;
  connectionStatus?: ConnectionStatus;
  actionMessage?: string;
  handResultMessage?: HandResultMessage;
  sceneModel?: TableSceneModel;
  topBarRight?: ReactNode;
  onAction: ActionBarOnAction;
  onToggleSittingOut?: () => void;
  onRejoin?: () => void;
  rejoinState?: RejoinUiState;
  rejoinErrorMessage?: string | null;
  onBackToLobby?: () => void;
  onPlayerPress?: (opponent: Opponent) => void;
  opponentStripEmptyState?: ReactNode;
  canRebuy?: boolean;
  onPressRebuy?: () => void;
  heroAvatarUrlOverride?: string;
  onHeroAvatarPress?: () => void;
  tableMode?: "live" | "replay";
  forceDisableActions?: boolean;
  disabledActionMessage?: string;
};

export function ActiveTableView({
  snapshot,
  opponents,
  balanceCents,
  tableStatus,
  connectionStatus,
  actionMessage,
  handResultMessage,
  sceneModel,
  topBarRight,
  onAction,
  onToggleSittingOut,
  onRejoin,
  rejoinState = "idle",
  rejoinErrorMessage = null,
  onBackToLobby,
  onPlayerPress,
  opponentStripEmptyState,
  canRebuy = false,
  onPressRebuy,
  heroAvatarUrlOverride,
  onHeroAvatarPress,
  tableMode = "live",
  forceDisableActions = false,
  disabledActionMessage = "Waiting for lesson result...",
}: ActiveTableViewProps) {
  const isReplayMode = tableMode === "replay";
  const [isPendingHeroAction, setIsPendingHeroAction] = useState(false);
  const prevHandIdRef = useRef<string | null>(null);
  const prevRevealedBoardCardsRef = useRef<number | null>(null);
  const { model, shellBaseProps, board } = useTableViewShellFrame({
    snapshot,
    sceneModel,
    handResultMessage,
    connectionStatus,
    balanceCents,
    topBarRight,
    opponents,
    opponentStripEmptyState,
    onPlayerPress,
  });
  const {
    handSummary,
    actionContext,
    canAct,
    heroStatus,
    communityCards,
    potCents,
    heroCards,
    heroStackCents,
    heroActionOptions,
    heroCalculations,
    heroPlayerStats,
    heroName,
    heroAvatarUrl,
    isHeroToAct,
    isHeroWinner,
    isHeroDealer,
  } = model;

  const turnCountdownSeconds = useTurnCountdown(isHeroToAct, tableMode === "live");
  const hasOpponentToAct = opponents.some((o) => o.isActive);
  const activeTurnProgress = useTurnProgress(hasOpponentToAct, tableMode === "live");

  useEffect(() => {
    const handId = snapshot.hand?.handId ?? null;
    const prevHandId = prevHandIdRef.current;

    if (prevHandId === null) {
      prevHandIdRef.current = handId;
      return;
    }

    if (handId != null && handId !== prevHandId) {
      emitSoundEvent("table.handStart");
    }

    prevHandIdRef.current = handId;
  }, [snapshot.hand?.handId]);

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

  const heroIsSeated = snapshot.hero.youAreSeated;
  const waitingBetweenHands = !snapshot.hand;
  const hasActionOptions = !!heroActionOptions;

  // Smart notification system for better UX
  const notification = useActiveTableNotification(
    waitingBetweenHands,
    hasActionOptions,
    actionContext.showActions,
    isPendingHeroAction,
    opponents,
    snapshot
  );

  // Hide the ActionBar optimistically as soon as the hero takes an action.
  // This avoids any visible pause while waiting for the server to advance to the next actor.
  const handleAction: ActionBarOnAction = useCallback(
    (payload) => {
      setIsPendingHeroAction(true);
      onAction(payload);
    },
    [onAction],
  );

  // Clear pending state once the server snapshot catches up and it's no longer our turn
  // (or there are no longer action options / hand in progress).
  useEffect(() => {
    if (!actionContext.showActions || !hasActionOptions || waitingBetweenHands) {
      setIsPendingHeroAction(false);
    }
  }, [actionContext.showActions, hasActionOptions, waitingBetweenHands]);

  const handleRejoin = useCallback(() => {
    onRejoin?.();
  }, [onRejoin]);

  const heroIsSittingOut =
    heroIsSeated &&
    heroStatus === "SITTING_OUT" &&
    !!onRejoin;

  let bottom: ReactNode = null;
  if (!isReplayMode) {
    if (!heroIsSeated) {
      bottom = (
        <View className="ui-p-inline-4">
          <Text className="text-center">You are not seated at this table.</Text>
        </View>
      );
    } else if (heroIsSittingOut) {
      bottom = (
        <RejoinCTA
          state={rejoinState}
          errorMessage={rejoinErrorMessage}
          onPressRejoin={handleRejoin}
          onBackToLobby={onBackToLobby}
          isFatalTableGone={Boolean(rejoinErrorMessage && /table no longer exists|table_gone/i.test(rejoinErrorMessage))}
        />
      );
    } else if (canRebuy && onPressRebuy) {
      bottom = <Button title="Rebuy" onPress={onPressRebuy} />;
    } else if (
      forceDisableActions ||
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
              <ActivityIndicator
                size="small"
                className="opacity-70"
              />
            )}
            <Text
              className={textVariantClass}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {forceDisableActions ? disabledActionMessage : notification.message}
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
        />
      );
    }
  }

  if (__DEV__ && !bottom && !isReplayMode) {
    // This should never happen: ActiveTableView must always render a bottom CTA/state.
    console.error("No bottom CTA rendered in ActiveTableView — illegal UI state", {
      hasHand: Boolean(snapshot.hand),
      heroIsSeated,
      canRebuy,
    });
  }

  return (
    <TableSceneShell
      {...shellBaseProps}
      activeTurnProgress={activeTurnProgress}
      dealerBar={
        <DealerAnnounceBar
          hand={handSummary}
          actionMessage={actionMessage}
          handResultMessage={handResultMessage}
          tableStatus={tableStatus}
          nextHandAtTs={snapshot.nextHandAtTs}
        />
      }
      board={board}
      hero={
        <HeroZone
          cards={heroCards}
          stackCents={heroStackCents}
          canAct={canAct}
          heroStatus={heroStatus}
          equity={heroCalculations?.equityPct}
          potOdds={heroCalculations?.potOddsPct}
          outs={heroCalculations?.outs}
          playerStats={heroPlayerStats}
          showStats={snapshot.table?.showStats ?? true}
          isWinner={isHeroWinner}
          isDealer={isHeroDealer}
          isActiveTurn={isHeroToAct}
          turnCountdownSeconds={turnCountdownSeconds ?? undefined}
          userName={heroName}
          avatarUrl={heroAvatarUrl ?? heroAvatarUrlOverride ?? undefined}
          potCents={potCents}
          onAvatarPress={onHeroAvatarPress}
          onToggleSittingOut={onToggleSittingOut}
        />
      }
      bottom={bottom}
      hideBottomSection={isReplayMode}
    />
  );
}
