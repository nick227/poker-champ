import { useMemo } from "react";
import type { TableSnapshotPayload, HeroActionOptions } from "@poker-champ/realtime-contract";
import { CANONICAL_LESSON_SNAPSHOT_VERSION } from "@poker-champ/realtime-contract";
import type { HandResultMessage, ConnectionStatus } from "../table.types";
import { TABLE } from "@/constants/copy";
import {
  buildSeatContext,
  getHeroDisplayStatus,
  getIsMyTurn,
  getCommunityCards,
  getHeroCards,
  getHeroStackCents,
  getPotCents,
  getIsDealer,
} from "../table.adapter";
import { getActionContext } from "../action-bar/actionBar.logic";

function mergeCallWithStack(
  actionOptions: HeroActionOptions | undefined,
  snapshot: TableSnapshotPayload,
  isMyTurn: boolean,
  heroStackCents: number,
  heroRoundBetCents: number,
): HeroActionOptions | undefined {
  if (!actionOptions || !isMyTurn || !snapshot.hand) return actionOptions;
  const roundCurrentBetCents = snapshot.hand.roundCurrentBetCents ?? 0;
  const rawCallAmount = Math.max(0, roundCurrentBetCents - heroRoundBetCents);
  const derivedCanCallWithStack = rawCallAmount > 0 && heroStackCents > 0;
  if (!derivedCanCallWithStack || actionOptions.canCall) return actionOptions;
  const callAmount = Math.min(rawCallAmount, heroStackCents);
  return { ...actionOptions, canCall: true, callAmount };
}

/** Derive full legal action options from snapshot state so all legal buttons can be enabled (e.g. lesson snapshots that only set expected action). */
function deriveFullActionOptionsFromSnapshot(
  snapshot: TableSnapshotPayload,
  heroStackCents: number,
  heroRoundBetCents: number,
): HeroActionOptions {
  const hand = snapshot.hand;
  const roundCurrentBetCents = hand?.roundCurrentBetCents ?? 0;
  const canCheck = roundCurrentBetCents === heroRoundBetCents;
  const callAmount = Math.max(0, roundCurrentBetCents - heroRoundBetCents);
  const canCall = callAmount > 0 && heroStackCents > 0;
  const canBet = roundCurrentBetCents === 0 && heroStackCents > 0;
  const canRaise = roundCurrentBetCents > 0 && heroStackCents > 0;
  return {
    canFold: true,
    canCheck,
    canCall,
    canBet,
    canRaise,
    canAllIn: heroStackCents > 0,
    primaryWagerAction: canBet ? "BET" : canRaise ? "RAISE" : "NONE",
    callAmount: canCall ? Math.min(callAmount, heroStackCents) : 0,
    minRaiseTo: undefined,
    maxRaiseTo: undefined,
  };
}

/** Expand options so any state-legal action is enabled (fixes minimal lesson snapshots that only set expected action). */
function expandOptionsWithFullLegal(
  actionOptions: HeroActionOptions | undefined,
  snapshot: TableSnapshotPayload,
  heroStackCents: number,
  heroRoundBetCents: number,
): HeroActionOptions | undefined {
  if (!actionOptions || !snapshot.hand) return actionOptions;
  const full = deriveFullActionOptionsFromSnapshot(snapshot, heroStackCents, heroRoundBetCents);
  return {
    ...actionOptions,
    canFold: actionOptions.canFold || full.canFold,
    canCheck: actionOptions.canCheck || full.canCheck,
    canCall: actionOptions.canCall || full.canCall,
    canBet: actionOptions.canBet || full.canBet,
    canRaise: actionOptions.canRaise || full.canRaise,
    canAllIn: actionOptions.canAllIn || full.canAllIn,
    callAmount: actionOptions.callAmount ?? full.callAmount,
    primaryWagerAction: actionOptions.primaryWagerAction !== "NONE" ? actionOptions.primaryWagerAction : full.primaryWagerAction,
  };
}

/** Derive minRaiseTo/maxRaiseTo from snapshot when missing (e.g. lesson snapshots from projectSpecToSnapshots). */
function fillWagerBoundsFromSnapshot(
  actionOptions: HeroActionOptions | undefined,
  snapshot: TableSnapshotPayload,
  heroStackCents: number,
  heroRoundBetCents: number,
): HeroActionOptions | undefined {
  if (!actionOptions || !snapshot.hand) return actionOptions;
  const hasBounds = actionOptions.minRaiseTo != null && actionOptions.maxRaiseTo != null;
  if (hasBounds) return actionOptions;
  const primary = actionOptions.primaryWagerAction;
  let needBet = primary === "BET" && actionOptions.canBet;
  let needRaise = primary === "RAISE" && actionOptions.canRaise;
  if (!needBet && !needRaise) {
    if (actionOptions.canBet || actionOptions.canRaise) {
      needBet = actionOptions.canBet;
      needRaise = actionOptions.canRaise && !needBet;
    } else {
      return actionOptions;
    }
  }

  const { hand, table } = snapshot;
  const roundCurrentBetCents = hand.roundCurrentBetCents ?? 0;
  const minRaiseCents = hand.minRaiseCents ?? 0;
  const bigBlindCents = table?.bigBlindCents ?? 100;

  let minRaiseTo: number;
  let maxRaiseTo: number;
  const useBet = needBet;
  if (useBet) {
    minRaiseTo = bigBlindCents;
    maxRaiseTo = heroStackCents;
  } else {
    minRaiseTo = roundCurrentBetCents + minRaiseCents;
    maxRaiseTo = heroRoundBetCents + heroStackCents;
  }
  if (minRaiseTo <= 0 || maxRaiseTo < minRaiseTo) return actionOptions;
  const primaryWagerAction = useBet ? "BET" : "RAISE";
  return { ...actionOptions, minRaiseTo, maxRaiseTo, primaryWagerAction };
}

export function buildTableSceneModel(
  snapshot: TableSnapshotPayload,
  handResultMessage?: HandResultMessage | null,
  connectionStatus?: ConnectionStatus,
) {
  const { hand } = snapshot;
  const seatContext = buildSeatContext(snapshot);
  const heroStatus = getHeroDisplayStatus(snapshot, seatContext);
  const isMyTurn = getIsMyTurn(snapshot, seatContext);
  const communityCards = getCommunityCards(snapshot);
  const potCents = getPotCents(snapshot);
  const heroCards = getHeroCards(snapshot);
  const heroStackCents = getHeroStackCents(snapshot, seatContext);
  const heroSeat = snapshot.hero.seat;
  const toActSeat = snapshot.hand?.toActSeat;
  const isHeroToAct =
    heroSeat != null &&
    toActSeat != null &&
    heroSeat === toActSeat;
  const heroName = seatContext.heroSeat?.name;
  const heroAvatarUrl =
    snapshot.hero.avatarUrl ?? seatContext.heroSeat?.avatarUrl ?? undefined;
  const isHeroWinner = !!handResultMessage && handResultMessage.winnerName === heroName;
  const isHeroDealer = getIsDealer(snapshot, seatContext);
  const tableName = snapshot.table?.tableName ?? TABLE.defaultTableName;
  const playerCount = seatContext.occupiedCount;
  const maxSeats = snapshot.table?.maxSeats ?? snapshot.seats.length;
  const blinds = snapshot.table
    ? { smallBlindCents: snapshot.table.smallBlindCents, bigBlindCents: snapshot.table.bigBlindCents }
    : undefined;
  const handSummary = hand ? { street: hand.street, potCents: hand.potCents } : undefined;
  const heroRoundBetCents = seatContext.heroSeat?.roundBetCents ?? 0;
  const mergedOptions = mergeCallWithStack(
    snapshot.hero.actionOptions,
    snapshot,
    isMyTurn,
    heroStackCents,
    heroRoundBetCents,
  );
  const expandedOptions = expandOptionsWithFullLegal(mergedOptions, snapshot, heroStackCents, heroRoundBetCents);
  const snapshotVersion = snapshot.lessonSnapshotVersion;
  const skipWagerRepair = snapshotVersion != null && snapshotVersion >= CANONICAL_LESSON_SNAPSHOT_VERSION;
  const heroActionOptions = skipWagerRepair
    ? expandedOptions
    : fillWagerBoundsFromSnapshot(expandedOptions, snapshot, heroStackCents, heroRoundBetCents);
  if (!skipWagerRepair && mergedOptions && snapshot.hero?.actionOptions && (snapshot.hero.actionOptions.minRaiseTo == null || snapshot.hero.actionOptions.maxRaiseTo == null)) {
    const needed = (mergedOptions.primaryWagerAction === "BET" && mergedOptions.canBet) || (mergedOptions.primaryWagerAction === "RAISE" && mergedOptions.canRaise);
    if (needed && heroActionOptions?.minRaiseTo != null) {
      console.warn("LESSON_SNAPSHOT_REPAIR: fillWagerBoundsFromSnapshot applied (legacy snapshot, lessonSnapshotVersion missing or < canonical)", {
        snapshotId: snapshot.snapshotId,
        lessonSnapshotVersion: snapshotVersion ?? "missing",
      });
    }
  }
  const actionContext = getActionContext({
    isMyTurn,
    actionOptions: heroActionOptions,
    connectionStatus,
  });

  if (__DEV__ && isMyTurn && heroActionOptions) {
    const anyHeroOption =
      !!heroActionOptions.canFold ||
      !!heroActionOptions.canCheck ||
      !!heroActionOptions.canCall ||
      !!heroActionOptions.canAllIn ||
      !!heroActionOptions.canBet ||
      !!heroActionOptions.canRaise;
    const anyUiAction =
      actionContext.allowedActions.FOLD ||
      actionContext.allowedActions.CHECK ||
      actionContext.allowedActions.CALL ||
      actionContext.allowedActions.ALL_IN ||
      actionContext.allowedActions.WAGER;
    if (!anyHeroOption || !anyUiAction) {
      console.warn("HUMAN_TO_ACT_ACTIONABILITY_DIAG", {
        tableId: snapshot.table.tableId,
        handId: snapshot.hand?.handId,
        snapshotId: snapshot.snapshotId,
        street: snapshot.hand?.street,
        toActSeat: snapshot.hand?.toActSeat,
        heroSeat,
        isMyTurn,
        connectionStatus,
        heroActionOptions: {
          canFold: !!heroActionOptions.canFold,
          canCheck: !!heroActionOptions.canCheck,
          canCall: !!heroActionOptions.canCall,
          canAllIn: !!heroActionOptions.canAllIn,
          canBet: !!heroActionOptions.canBet,
          canRaise: !!heroActionOptions.canRaise,
          callAmount: heroActionOptions.callAmount ?? null,
          primaryWagerAction: heroActionOptions.primaryWagerAction ?? null,
        },
        allowedActions: actionContext.allowedActions,
      });
    }
  }

  return {
    handSummary,
    actionContext,
    canAct: actionContext.showActions,
    heroStatus,
    communityCards,
    potCents,
    heroCards,
    heroStackCents,
    heroActionOptions,
    heroCalculations: snapshot.hero.calculations,
    heroPlayerStats: snapshot.hero.playerStats,
    heroName,
    heroAvatarUrl,
    isHeroToAct,
    isHeroWinner,
    isHeroDealer,
    tableName,
    playerCount,
    maxSeats,
    blinds,
  };
}

export type TableSceneModel = ReturnType<typeof buildTableSceneModel>;

export function useTableSceneModel(
  snapshot: TableSnapshotPayload,
  handResultMessage?: HandResultMessage | null,
  connectionStatus?: ConnectionStatus,
) {
  return useMemo(
    () => buildTableSceneModel(snapshot, handResultMessage, connectionStatus),
    [snapshot, handResultMessage, connectionStatus],
  );
}
