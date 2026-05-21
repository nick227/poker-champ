import type { ReactNode } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { TournamentTableBanner } from "../TournamentTableBanner";
import { TournamentResultBanner } from "../TournamentResultBanner";
import { BoardArea } from "../board-area";
import type { Opponent } from "../opponent-strip";
import { DUMMY_TABLE_SNAPSHOT } from "../dummyTableSnapshot";
import { useTableSceneModel, type TableSceneModel } from "../model/useTableSceneModel";
import type { TableSceneShellProps } from "../table-layout";
import type { ConnectionStatus, HandResultMessage } from "../table.types";
import type { UiCard } from "../table.adapter";
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
  | "tournamentBanner"
>;

type UseTableViewShellFrameParams = {
  snapshot: TableSnapshotPayload | null;
  sceneModel?: TableSceneModel;
  winnerBanner?: HandResultMessage | null;
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
  onViewTournamentStandings?: () => void;
  boardCardsOverride?: UiCard[] | null;
  potCentsOverride?: number;
  animateBoardReset?: boolean;
};

export function useTableViewShellFrame({
  snapshot,
  sceneModel,
  winnerBanner,
  connectionStatus,
  balanceCents,
  topBarRight,
  opponents,
  opponentStripEmptyState,
  onPlayerPress,
  onBoardBounds,
  onCardSlotBounds,
  onSeatBounds,
  onViewTournamentStandings,
  boardCardsOverride,
  potCentsOverride,
  animateBoardReset = false,
}: UseTableViewShellFrameParams) {
  const effectiveSnapshot = snapshot ?? DUMMY_TABLE_SNAPSHOT;
  const resolvedModel = useTableSceneModel(effectiveSnapshot, connectionStatus);
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
    winnerName: winnerBanner?.winnerName,
    onPlayerPress,
    onSeatBounds,
    tournamentBanner: table?.tournament ? (
      <>
        <TournamentTableBanner tournament={table.tournament} />
        {onViewTournamentStandings ? (
          <TournamentResultBanner
            tournament={table.tournament}
            heroSeated={effectiveSnapshot.hero.youAreSeated}
            onViewStandings={onViewTournamentStandings}
          />
        ) : null}
      </>
    ) : undefined,
  };
  const boardContent = (
    <BoardArea
      cards={boardCardsOverride ?? model.communityCards}
      potCents={potCentsOverride ?? model.potCents}
      animateReset={animateBoardReset}
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
