import { type ReactNode } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { type Opponent } from "./OpponentStrip";
import { DealerAnnounceBar } from "./DealerAnnounceBar";
import { CommunityBoard } from "./CommunityBoard";
import { HeroZone } from "./HeroZone";
import { Button } from "@/components/base/Button";
import { useTableSceneModel, type TableSceneModel } from "./hooks/useTableSceneModel";
import { TableSceneShell } from "./TableSceneShell";

export type EmptyTableViewProps = {
  snapshot: TableSnapshotPayload;
  opponents: Opponent[];
  balanceCents: number;
  tableStatus?: string;
  handResultMessage?: { winnerName: string; amountCents: number; winningHandDescr?: string };
  sceneModel?: TableSceneModel;
  topBarLeft?: ReactNode;
  topBarRight?: ReactNode;
  onPlayerPress?: (opponent: Opponent) => void;
  canRebuy?: boolean;
  onPressRebuy?: () => void;
};

export function EmptyTableView({
  snapshot,
  opponents,
  balanceCents,
  tableStatus,
  handResultMessage,
  sceneModel,
  topBarLeft,
  topBarRight,
  onPlayerPress,
  canRebuy = false,
  onPressRebuy,
}: EmptyTableViewProps) {
  const model = useTableSceneModel(snapshot, handResultMessage ?? null, undefined);
  const {
    heroStatus,
    heroStackCents,
    heroCards,
    potCents,
    communityCards,
    tableName,
    playerCount,
    maxSeats,
    blinds,
  } = sceneModel ?? model;

  return (
    <TableSceneShell
      tableName={tableName}
      blinds={blinds}
      playerCount={playerCount}
      maxSeats={maxSeats}
      balanceCents={balanceCents}
      topBarLeft={topBarLeft}
      topBarRight={topBarRight}
      opponents={opponents}
      winnerName={handResultMessage?.winnerName}
      onPlayerPress={onPlayerPress}
      dealerBar={
        <DealerAnnounceBar
          hand={undefined}
          handResultMessage={handResultMessage}
          tableStatus={tableStatus}
          nextHandAtTs={snapshot.nextHandAtTs}
        />
      }
      board={<CommunityBoard cards={communityCards} potCents={potCents} />}
      hero={
        <HeroZone
          cards={heroCards}
          stackCents={heroStackCents}
          canAct={false}
          heroStatus={heroStatus}
          userName={snapshot.seats.find((s) => s.seat === snapshot.hero.seat)?.name}
        />
      }
      bottom={canRebuy && onPressRebuy ? <Button title="Rebuy" onPress={onPressRebuy} /> : null}
      rootClassName="overflow-hidden"
      titleSectionClassName="mb-4"
      topBarSectionClassName="border-t border-b border-border-subtle mb-4"
    />
  );
}
