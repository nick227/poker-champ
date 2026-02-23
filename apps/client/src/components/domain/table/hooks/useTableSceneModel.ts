import { useMemo } from "react";
import type { TableSnapshotPayload, HeroActionOptions } from "@poker-champ/realtime-contract";
import type { HandResultMessage, ConnectionStatus } from "../table.types";
import { TABLE } from "@/constants/copy";
import {
  getHeroDisplayStatus,
  getIsMyTurn,
  getCommunityCards,
  getHeroCards,
  getHeroStackCents,
  getPotCents,
  getIsDealer,
} from "../table.adapter";
import { getActionContext } from "../actionBar.logic";

function mergeCallWithStack(
  actionOptions: HeroActionOptions | undefined,
  snapshot: TableSnapshotPayload,
  isMyTurn: boolean,
  heroStackCents: number,
): HeroActionOptions | undefined {
  if (!actionOptions || !isMyTurn || !snapshot.hand) return actionOptions;
  const roundCurrentBetCents = snapshot.hand.roundCurrentBetCents ?? 0;
  const heroSeat = snapshot.seats.find((s) => s.seat === snapshot.hero.seat);
  const heroRoundBetCents = heroSeat?.roundBetCents ?? 0;
  const rawCallAmount = Math.max(0, roundCurrentBetCents - heroRoundBetCents);
  const derivedCanCallWithStack = rawCallAmount > 0 && heroStackCents > 0;
  if (!derivedCanCallWithStack || actionOptions.canCall) return actionOptions;
  const callAmount = Math.min(rawCallAmount, heroStackCents);
  return { ...actionOptions, canCall: true, callAmount };
}

export function buildTableSceneModel(
  snapshot: TableSnapshotPayload,
  handResultMessage?: HandResultMessage | null,
  connectionStatus?: ConnectionStatus,
) {
  const { hand } = snapshot;
  const heroStatus = getHeroDisplayStatus(snapshot);
  const isMyTurn = getIsMyTurn(snapshot);
  const communityCards = getCommunityCards(snapshot);
  const potCents = getPotCents(snapshot);
  const heroCards = getHeroCards(snapshot);
  const heroStackCents = getHeroStackCents(snapshot);
  const heroSeat = snapshot.hero.seat;
  const toActSeat = snapshot.hand?.toActSeat;
  const isHeroToAct =
    heroSeat != null &&
    toActSeat != null &&
    heroSeat === toActSeat;
  const heroName = snapshot.seats.find((s) => s.seat === snapshot.hero.seat)?.name;
  const isHeroWinner = !!handResultMessage && handResultMessage.winnerName === heroName;
  const isHeroDealer = getIsDealer(snapshot);
  const tableName = snapshot.table?.tableName ?? TABLE.defaultTableName;
  const playerCount = snapshot.seats.filter((s) => s.occupied).length;
  const maxSeats = snapshot.table?.maxSeats ?? snapshot.seats.length;
  const blinds = snapshot.table
    ? { smallBlindCents: snapshot.table.smallBlindCents, bigBlindCents: snapshot.table.bigBlindCents }
    : undefined;
  const handSummary = hand ? { street: hand.street, potCents: hand.potCents } : undefined;
  const heroActionOptions = mergeCallWithStack(snapshot.hero.actionOptions, snapshot, isMyTurn, heroStackCents);
  const actionContext = getActionContext({
    isMyTurn,
    actionOptions: heroActionOptions,
    connectionStatus,
  });

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
