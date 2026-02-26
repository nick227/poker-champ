/**
 * collapsable={false} on fixed-height layout shells prevents Yoga from flattening
 * the tree and avoids re-measure jitter on Android/Web. Do not remove.
 */
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { type Opponent } from "../OpponentStrip";
import { DealerAnnounceBar } from "../DealerAnnounceBar";
import { HeroZone } from "../HeroZone";
import { ActionBar, type ActionBarOnAction } from "../ActionBar";
import { Button } from "@/components/base/Button";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import type { TableSceneModel } from "../model/useTableSceneModel";
import type { ConnectionStatus, HandResultMessage } from "../table.types";
import { TableSceneShell } from "../shell/TableSceneShell";
import { useTableViewShellFrame } from "./tableView.shared";

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
  onPlayerPress?: (opponent: Opponent) => void;
  opponentStripEmptyState?: ReactNode;
  canRebuy?: boolean;
  onPressRebuy?: () => void;
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
  onPlayerPress,
  opponentStripEmptyState,
  canRebuy = false,
  onPressRebuy,
}: ActiveTableViewProps) {
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
    isHeroToAct,
    isHeroWinner,
    isHeroDealer,
  } = model;

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

  return (
    <TableSceneShell
      {...shellBaseProps}
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
          userName={heroName}
          potCents={potCents}
          onToggleSittingOut={onToggleSittingOut}
        />
      }
      bottom={
        canRebuy && onPressRebuy ? (
          <Button title="Rebuy" onPress={onPressRebuy} />
        ) : (
          <ActionBar
            actionContext={actionContext}
            heroStatus={heroStatus}
            actionOptions={heroActionOptions}
            potCents={potCents}
            onAction={onAction}
          />
        )
      }
    />
  );
}
