import type { ReactNode } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { BoardArea } from "../board-area";
import type { Opponent } from "../opponent-strip";
import { DUMMY_TABLE_SNAPSHOT } from "../dummyTableSnapshot";
import { useTableSceneModel, type TableSceneModel } from "../model/useTableSceneModel";
import type { TableSceneShellProps } from "../table-layout";
import type { ConnectionStatus, HandResultMessage } from "../table.types";
import type { Rect } from "@/features/table/animations/animationTypes";
import { BoardBoundsReporter } from "../board-area";

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
  | "onSeatBounds"
>;

type UseTableViewShellFrameParams = {
  snapshot: TableSnapshotPayload | null;
  sceneModel?: TableSceneModel;
  handResultMessage?: HandResultMessage | null;
  connectionStatus?: ConnectionStatus;
  balanceCents: number;
  topBarRight?: ReactNode;
  opponents: Opponent[];
  opponentStripEmptyState?: ReactNode;
  onPlayerPress?: (opponent: Opponent) => void;
  /** When set, board is wrapped and measured; rect reported for overlay (overlay coordinate space). */
  onBoardBounds?: (rect: Rect) => void;
  /** When set, each community card slot (0..4) reports bounds for CARD-anchored FX. */
  onCardSlotBounds?: (index: number, rect: Rect) => void;
  /** When set, passed to shell for SEAT-anchored FX (reportSeatBounds). */
  onSeatBounds?: (seatIndex: number, rect: Rect) => void;
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
  onBoardBounds,
  onCardSlotBounds,
  onSeatBounds,
}: UseTableViewShellFrameParams) {
  const effectiveSnapshot = snapshot ?? DUMMY_TABLE_SNAPSHOT;
  const resolvedModel = useTableSceneModel(effectiveSnapshot, handResultMessage ?? null, connectionStatus);
  const model = sceneModel ?? resolvedModel;
  const { table } = effectiveSnapshot;
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
    onSeatBounds,
  };
  const boardContent = (
    <BoardArea
      cards={model.communityCards}
      potCents={model.potCents}
      onCardSlotBounds={onCardSlotBounds}
    />
  );
  const board = onBoardBounds ? (
    <BoardBoundsReporter onBoardBounds={onBoardBounds}>{boardContent}</BoardBoundsReporter>
  ) : (
    boardContent
  );

  return { model, shellBaseProps, board };
}
