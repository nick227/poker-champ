import { useMemo, type ReactNode } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { TournamentTableBanner } from "../TournamentTableBanner";
import { TournamentResultBanner } from "../TournamentResultBanner";
import { BoardArea } from "../board-area";
import type { Opponent } from "../opponent-strip";
import { DUMMY_TABLE_SNAPSHOT } from "../dummyTableSnapshot";
import { formatCents } from "@/lib/format";
import { useTableMoneyDisplay } from "@/features/table/context/TableMoneyDisplayContext";
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
  | "maxSeats"
  | "heroSeat"
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
  onBackToLobby?: () => void;
  boardCardsOverride?: UiCard[] | null;
  potCentsOverride?: number;
  animateBoardReset?: boolean;
  /** Dealer/status line rendered under community cards in the board stack. */
  boardAnnounce?: ReactNode;
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
  onBackToLobby,
  boardCardsOverride,
  potCentsOverride,
  animateBoardReset = false,
  boardAnnounce = null,
}: UseTableViewShellFrameParams) {
  const { formatBet, isTournamentTable } = useTableMoneyDisplay();
  const formatChipAmount = isTournamentTable ? formatBet : formatCents;
  const deriveOptions = useMemo(
    () => ({ formatChipAmount }),
    [formatChipAmount],
  );
  const effectiveSnapshot = snapshot ?? DUMMY_TABLE_SNAPSHOT;
  const resolvedModel = useTableSceneModel(effectiveSnapshot, connectionStatus, deriveOptions);
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
    maxSeats: table?.maxSeats ?? 6,
    heroSeat: effectiveSnapshot.hero.seat ?? 0,
    tournamentBanner: table?.tournament ? (
      <>
        <TournamentTableBanner tournament={table.tournament} />
        {onViewTournamentStandings && onBackToLobby ? (
          <TournamentResultBanner
            tournament={table.tournament}
            tournamentViewer={effectiveSnapshot.hero.tournamentViewer}
            onViewStandings={onViewTournamentStandings}
            onBackToLobby={onBackToLobby}
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
      fitContent
      announce={boardAnnounce}
    />
  );
  const board = onBoardBounds ? (
    <BoardBoundsReporter onBoardBounds={onBoardBounds}>{boardContent}</BoardBoundsReporter>
  ) : (
    boardContent
  );

  return { model, shellBaseProps, board };
}
