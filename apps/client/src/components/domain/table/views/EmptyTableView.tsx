import { type ReactNode } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { type Opponent } from "../OpponentStrip";
import { DealerAnnounceBar } from "../DealerAnnounceBar";
import { HeroZone } from "../HeroZone";
import { Button } from "@/components/base/Button";
import type { TableSceneModel } from "../model/useTableSceneModel";
import { TableSceneShell } from "../shell/TableSceneShell";
import type { HandResultMessage } from "../table.types";
import { useTableViewShellFrame } from "./tableView.shared";

export type EmptyTableViewProps = {
  snapshot: TableSnapshotPayload;
  opponents: Opponent[];
  balanceCents: number;
  tableStatus?: string;
  handResultMessage?: HandResultMessage;
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
  const { model, shellBaseProps, board } = useTableViewShellFrame({
    snapshot,
    sceneModel,
    handResultMessage,
    connectionStatus: undefined,
    balanceCents,
    topBarRight,
    opponents,
    opponentStripEmptyState,
    onPlayerPress,
  });
  const {
    heroStatus,
    heroStackCents,
    heroCards,
  } = model;

  return (
    <TableSceneShell
      {...shellBaseProps}
      dealerBar={
        <DealerAnnounceBar
          hand={undefined}
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
