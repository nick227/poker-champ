import { type ReactNode } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { type Opponent } from "./OpponentStrip";
import { DealerAnnounceBar } from "./DealerAnnounceBar";
import { CommunityBoard } from "./CommunityBoard";
import { HeroZone } from "./HeroZone";
import { Button } from "@/components/base/Button";
import { useTableSceneModel, type TableSceneModel } from "./hooks/useTableSceneModel";
import { TableSceneShell } from "./TableSceneShell";
import { TABLE_SHELL_TITLE_CLASSNAME, TABLE_SHELL_TOP_BAR_CLASSNAME } from "./constants/tableLayout.constants";

export type EmptyTableViewProps = {
  snapshot: TableSnapshotPayload;
  opponents: Opponent[];
  balanceCents: number;
  tableStatus?: string;
  handResultMessage?: { winnerName: string; amountCents: number; winningHandDescr?: string };
  sceneModel?: TableSceneModel;
  topBarRight?: ReactNode;
  onCloseTable?: () => void;
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
  topBarRight,
  onCloseTable,
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
      topBarRight={topBarRight}
      onCloseTable={onCloseTable}
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
      titleSectionClassName={TABLE_SHELL_TITLE_CLASSNAME}
      topBarSectionClassName={TABLE_SHELL_TOP_BAR_CLASSNAME}
    />
  );
}
