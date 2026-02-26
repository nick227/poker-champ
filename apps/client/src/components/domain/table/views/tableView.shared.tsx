import type { ReactNode } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { CommunityBoard } from "../CommunityBoard";
import type { Opponent } from "../OpponentStrip";
import { useTableSceneModel, type TableSceneModel } from "../model/useTableSceneModel";
import type { TableSceneShellProps } from "../shell/TableSceneShell";
import type { ConnectionStatus, HandResultMessage } from "../table.types";

type TableShellBaseProps = Pick<
  TableSceneShellProps,
  | "tableName"
  | "balanceCents"
  | "playerStackCents"
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
  const shellBaseProps: TableShellBaseProps = {
    tableName: model.tableName,
    balanceCents,
    playerStackCents: model.heroStackCents,
    topBarRight,
    opponents,
    opponentStripEmptyState,
    winnerName: handResultMessage?.winnerName,
    onPlayerPress,
  };
  const board = <CommunityBoard cards={model.communityCards} potCents={model.potCents} />;

  return { model, shellBaseProps, board };
}
