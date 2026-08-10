/**
 * collapsable={false} on fixed-height layout shells prevents Yoga from flattening
 * the tree and avoids re-measure jitter on Android/Web. Do not remove.
 */
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { type Opponent } from "../opponent-strip";
import { DealerAnnounceBar } from "../DealerAnnounceBar";
import { ActionBar, type ActionBarOnAction } from "../action-bar";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import { emitHapticEvent } from "@/haptics/emitHapticEvent";
import type { TableSceneModel } from "../model/useTableSceneModel";
import type { ConnectionStatus, HandResultMessage } from "../table.types";
import type { Rect } from "@/features/table/animations/animationTypes";
import { TableSceneShell } from "../table-layout";
import { useTableViewShellFrame } from "./tableView.shared";
import { useActiveTableNotification } from "../hooks/useActiveTableNotification";
import { useTurnCountdown, useTurnProgress } from "../hooks/useTurnCountdown";
import { RejoinCTA, type RejoinUiState } from "../RejoinCTA";
import { buildHeroPlate } from "../table-stage";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useTableMoneyDisplay } from "@/features/table/context/TableMoneyDisplayContext";

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
  onJoinTable?: () => void;
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
  /** Optional override for whether to show hero calculation chips (equity / VPIP / PFR). */
  showHeroStats?: boolean;
  forceDisableActions?: boolean;
  disabledActionMessage?: string;
  /** When true, action bar is always interactive (e.g. lesson mode so resume at step 2/3 works). */
  forceActionBarInteractive?: boolean;
  /** Report board rect for overlay BOARD-anchored FX (overlay coordinate space). */
  onBoardBounds?: (rect: Rect) => void;
  /** Report hero zone rect for HERO-anchored FX. */
  onHeroBounds?: (rect: Rect) => void;
  /** Report seat rect by index for SEAT-anchored FX (e.g. winnerSeat). */
  onSeatBounds?: (seatIndex: number, rect: Rect) => void;
  /** Report community card slot rect (0..4) for CARD-anchored FX. */
  onCardSlotBounds?: (index: number, rect: Rect) => void;
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
  onJoinTable,
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
  showHeroStats,
  forceDisableActions = false,
  disabledActionMessage = "Waiting for lesson result...",
  forceActionBarInteractive = false,
  onBoardBounds,
  onHeroBounds,
  onSeatBounds,
  onCardSlotBounds,
}: ActiveTableViewProps) {
  const isReplayMode = tableMode === "replay";
  const [isPendingHeroAction, setIsPendingHeroAction] = useState(false);
  const prevHandIdRef = useRef<string | null>(null);
  const prevRevealedBoardCardsRef = useRef<number | null>(null);
  const { model, shellBaseProps, board } = useTableViewShellFrame({
    snapshot,
    sceneModel,
    winnerBanner: handResultMessage,
    connectionStatus,
    balanceCents,
    topBarRight,
    opponents,
    opponentStripEmptyState,
    onPlayerPress,
    onBoardBounds,
    onCardSlotBounds,
    onSeatBounds,
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

  const turnDeadlineMs = snapshot.hand?.turnDeadlineMs;
  const turnTimeoutTotalMs = snapshot.hand?.turnTimeoutTotalMs;
  const hasOpponentToAct = opponents.some((o) => o.isActive);
  const seatToAct = isHeroToAct || hasOpponentToAct;
  const turnCountdownSeconds = useTurnCountdown(
    seatToAct,
    tableMode === "live",
    turnDeadlineMs,
    turnTimeoutTotalMs,
  );
  const activeTurnProgress = useTurnProgress(seatToAct, tableMode === "live", turnTimeoutTotalMs);

  useEffect(() => {
    const handId = snapshot.hand?.handId ?? null;
    const prevHandId = prevHandIdRef.current;

    if (prevHandId === null) {
      prevHandIdRef.current = handId;
      return;
    }

    if (handId != null && handId !== prevHandId) {
      emitSoundEvent("table.handStart");
      emitHapticEvent("table.cardDeal");
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
      emitHapticEvent("table.cardDeal");
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
        <View className="ui-p-inline-4 gap-y-2">
          <Text className="text-center">You are not seated at this table.</Text>
          <View className="ui-row gap-x-2 justify-center">
            {onJoinTable ? <Button title="Join table" onPress={onJoinTable} /> : null}
            {onBackToLobby ? <Button title="Back to lobby" onPress={onBackToLobby} variant="ghost" /> : null}
          </View>
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
      (!forceActionBarInteractive &&
        (waitingBetweenHands ||
          !hasActionOptions ||
          !actionContext.showActions ||
          isPendingHeroAction))
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
          forceInteractive={forceActionBarInteractive}
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

  const cardFacePackId = usePreferencesStore((s) => s.cardFacePackId);
  const { formatStack, formatBet } = useTableMoneyDisplay();
  const heroRoundBetCents =
    snapshot.seats.find((s) => s.seat === snapshot.hero.seat)?.roundBetCents ?? 0;
  const heroPlate =
    !isReplayMode && heroIsSeated
      ? buildHeroPlate({
          userName: heroName,
          stackDisplay: formatStack(heroStackCents),
          avatarUrl: heroAvatarUrl ?? heroAvatarUrlOverride ?? undefined,
          cards: heroCards,
          heroStatus,
          isDealer: isHeroDealer,
          isActiveTurn: isHeroToAct,
          isWinner: isHeroWinner,
          cardFacePackId,
          betDisplay: heroRoundBetCents > 0 ? formatBet(heroRoundBetCents) : null,
          turnProgress: isHeroToAct ? activeTurnProgress : null,
          turnCountdownSeconds: isHeroToAct ? turnCountdownSeconds : null,
        })
      : null;

  return (
    <TableSceneShell
      {...shellBaseProps}
      activeTurnProgress={activeTurnProgress}
      turnCountdownSeconds={turnCountdownSeconds}
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
      onSeatBounds={onSeatBounds}
      onHeroBounds={onHeroBounds}
      hero={null}
      heroPlate={heroPlate}
      bottom={bottom}
      hideBottomSection={isReplayMode}
    />
  );
}
