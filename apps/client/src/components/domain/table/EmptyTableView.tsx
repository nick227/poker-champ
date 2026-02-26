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
  topBarRight?: ReactNode;
  onPlayerPress?: (opponent: Opponent) => void;
  opponentStripEmptyState?: ReactNode;
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
  topBarRight,
  onPlayerPress,
  opponentStripEmptyState,
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
  } = sceneModel ?? model;

  return (
    <TableSceneShell
      tableName={tableName}
      balanceCents={balanceCents}
      playerStackCents={heroStackCents}
      topBarRight={topBarRight}
      opponents={opponents}
      opponentStripEmptyState={opponentStripEmptyState}
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
          userName={snapshot.seats.find((s: any) => s.seat === snapshot.hero.seat)?.name}
        />
      }
      bottom={canRebuy && onPressRebuy ? <Button title="Rebuy" onPress={onPressRebuy} /> : null}
      rootClassName="overflow-hidden"
    />
  );
}
