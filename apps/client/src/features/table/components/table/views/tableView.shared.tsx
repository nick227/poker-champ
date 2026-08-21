import { useMemo, type ReactNode } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { GIFT_CATALOG_BY_KEY } from "@poker-champ/realtime-contract";
import { TournamentResultBanner } from "../TournamentResultBanner";
import { BoardArea } from "../board-area";
import type { Opponent } from "../table.adapter";
import { DUMMY_TABLE_SNAPSHOT } from "../dummyTableSnapshot";
import { formatCents } from "@/lib/format";
import { useTableMoneyDisplay } from "@/features/table/context/TableMoneyDisplayContext";
import { useTableSceneModel, type TableSceneModel } from "../model/useTableSceneModel";
import type { TableSceneShellProps } from "../table-layout";
import type { ConnectionStatus } from "../table.types";
import type { UiCard } from "../table.adapter";
import type { Rect } from "@/features/table/animations/animationTypes";
import { BoardBoundsReporter } from "../board-area";
import { useTableStore } from "@/features/table/stores/table.store";

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
  | "onSeatInteractPress"
  | "onSeatBounds"
  | "tournamentBanner"
  | "maxSeats"
  | "heroSeat"
>;

type UseTableViewShellFrameParams = {
  snapshot: TableSnapshotPayload | null;
  sceneModel?: TableSceneModel;
  /**
   * Winning seat's name for the per-tile seat-pulse (TableStage's winnerName prop) only — not the
   * same timing as the announce text. Callers on the live table pass the delay-aware
   * renderModel.revealedWinnerName here, not the raw winnerBanner, so the seat glow doesn't fire
   * before a showdown reveal animation plays. See useTablePageController's "Delayed reveal" effect.
   */
  winnerName?: string | null;
  connectionStatus?: ConnectionStatus;
  balanceCents: number;
  topBarRight?: ReactNode;
  opponents: Opponent[];
  opponentStripEmptyState?: ReactNode;
  onPlayerPress?: (opponent: Opponent) => void;
  onSeatInteractPress?: (opponent: Opponent) => void;
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
  winnerName,
  connectionStatus,
  balanceCents,
  topBarRight,
  opponents,
  opponentStripEmptyState,
  onPlayerPress,
  onSeatInteractPress,
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
    winnerName: winnerName ?? undefined,
    onPlayerPress,
    onSeatInteractPress,
    onSeatBounds,
    maxSeats: table?.maxSeats ?? 6,
    heroSeat: effectiveSnapshot.hero.seat ?? 0,
    tournamentBanner:
      table?.tournament && onViewTournamentStandings && onBackToLobby ? (
        <TournamentResultBanner
          tournament={table.tournament}
          tournamentViewer={effectiveSnapshot.hero.tournamentViewer}
          onViewStandings={onViewTournamentStandings}
          onBackToLobby={onBackToLobby}
        />
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

/** Persistent per-seat gift badge (~3 orbits) tracked in table.store's activeGiftsByTableId. */
function useActiveGiftsForTable(tableId: string | undefined) {
  return useTableStore((s) => (tableId ? s.activeGiftsByTableId[tableId] : undefined)) ?? {};
}

/** Merges each opponent's active gift badge in, so it renders in both idle and active table views. */
export function useOpponentsWithActiveGifts(tableId: string | undefined, opponents: Opponent[]): Opponent[] {
  const activeGifts = useActiveGiftsForTable(tableId);
  return useMemo(
    () =>
      opponents.map((o) => {
        const gift = activeGifts[o.id];
        const entry = gift ? GIFT_CATALOG_BY_KEY.get(gift.catalogKey) : null;
        return { ...o, activeGift: entry ? { emoji: entry.emoji } : null };
      }),
    [opponents, activeGifts],
  );
}

/** Same lookup for the hero's own seat, to pass into buildHeroPlate. */
export function useHeroActiveGift(
  tableId: string | undefined,
  heroUserId: string | undefined,
): { emoji: string } | null {
  const activeGifts = useActiveGiftsForTable(tableId);
  return useMemo(() => {
    const gift = heroUserId ? activeGifts[heroUserId] : undefined;
    const entry = gift ? GIFT_CATALOG_BY_KEY.get(gift.catalogKey) : null;
    return entry ? { emoji: entry.emoji } : null;
  }, [activeGifts, heroUserId]);
}
