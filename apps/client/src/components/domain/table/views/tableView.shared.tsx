import type { ReactNode } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { BoardArea } from "../BoardArea";
import type { Opponent } from "../OpponentStrip";
import { useTableSceneModel, type TableSceneModel } from "../model/useTableSceneModel";
import type { TableSceneShellProps } from "../shell/TableSceneShell";
import type { ConnectionStatus, HandResultMessage } from "../table.types";

type TableShellBaseProps = Pick<
  TableSceneShellProps,
  | "tableName"
  | "balanceCents"
  | "playerStackCents"
  | "smallBlindCents"
  | "bigBlindCents"
  | "minBuyInCents"
  | "topBarRight"
  | "opponents"
  | "opponentStripEmptyState"
  | "winnerName"
  | "onPlayerPress"
>;

type UseTableViewShellFrameParams = {
  snapshot: TableSnapshotPayload;
  sceneModel?: TableSceneModel;
  handResultMessage?: HandResultMessage | null;
  connectionStatus?: ConnectionStatus;
  balanceCents: number;
  topBarRight?: ReactNode;
  opponents: Opponent[];
  opponentStripEmptyState?: ReactNode;
  onPlayerPress?: (opponent: Opponent) => void;
};

export function useTableViewShellFrame({
  snapshot,
  sceneModel,
  handResultMessage,
  connectionStatus,
  balanceCents,
  topBarRight,
  opponents,
  opponentStripEmptyState,
  onPlayerPress,
}: UseTableViewShellFrameParams) {
  const resolvedModel = useTableSceneModel(snapshot, handResultMessage ?? null, connectionStatus);
  const model = sceneModel ?? resolvedModel;
  const { table } = snapshot;
  const shellBaseProps: TableShellBaseProps = {
    tableName: model.tableName,
    balanceCents,
    playerStackCents: model.heroStackCents,
    smallBlindCents: table?.smallBlindCents,
    bigBlindCents: table?.bigBlindCents,
    minBuyInCents: table?.minBuyInCents,
    topBarRight,
    opponents,
    opponentStripEmptyState,
    winnerName: handResultMessage?.winnerName,
    onPlayerPress,
  };
  const board = (
    <BoardArea
      cards={model.communityCards}
      potCents={model.potCents}
    />
  );

  return { model, shellBaseProps, board };
}
