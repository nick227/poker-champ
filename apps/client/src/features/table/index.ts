export { TableTopNavMenu } from "./components/table/TableTopNavMenu";
export { TournamentTableBanner } from "./components/table/TournamentTableBanner";
export { TournamentResultBanner } from "./components/table/TournamentResultBanner";
export { TournamentInTheMoneyReveal } from "./components/table/TournamentInTheMoneyReveal";
export { PlayerHistoryPopup } from "./components/table/PlayerHistoryPopup";
export { ActiveTablesDropdown } from "./components/table/ActiveTablesDropdown";
export { BotPickerSheet } from "./components/table/BotPickerSheet";
export { ThemePickerSheet } from "./components/table/ThemePickerSheet";
export type { RejoinUiState } from "./components/table/RejoinCTA";

export {
  buildSeatContext,
  getHeroDisplayStatus,
  mapSeatsToOpponents,
  getHeroStackCents,
  getPotCents,
} from "./components/table/table.adapter";
export type { Opponent, UiCard } from "./components/table/table.adapter";

export { TableSceneShell } from "./components/table/table-layout";
export type { TableSceneShellProps } from "./components/table/table-layout";
export { TableStage } from "./components/table/table-stage";
export type { TableStageProps, SeatPlateProps } from "./components/table/table-stage";
export { ActiveTableView } from "./components/table/views/ActiveTableView";
export { getLoadingSlots, getPlaceholderSlots } from "./components/table/views/tableSceneSlots";
export { useIdleTableSlots } from "./components/table/views/useIdleTableSlots";
export { useActiveTableSlots } from "./components/table/views/useActiveTableSlots";

export {
  getActionContext,
  useWagerCalculations,
  buildWagerActionPayload,
  resolvePrimaryWagerAction,
  resolveWagerCents,
  normalizeCapabilities,
  type ActionContext,
  type ActionBarConnectionStatus,
  type WagerBounds,
  type NormalizedCapabilities,
} from "./components/table/action-bar/actionBar.logic";
export { ActionBar } from "./components/table/action-bar/ActionBar";
export type { ActionBarProps, ActionBarOnAction, TableAction } from "./components/table/action-bar/ActionBar";
export { ACTION_BAR_HEIGHT } from "./components/table/action-bar/ActionBar";
export { AllInBanner, type AllInBannerProps } from "./components/table/action-bar/AllInBanner";
export {
  PokerActionButton,
  type PokerActionButtonProps,
  type PokerActionVariant,
} from "./components/table/action-bar/PokerActionButton";

export type { ActionNotice, HandResultMessage, ConnectionStatus, TableDisplayEvents } from "./components/table/table.types";
export {
  buildActionMessage,
  buildWinnerBannerFromSnapshot,
  buildWinnerMessageText,
} from "./components/table/displayMessages";
export { buildTableSceneModel, useTableSceneModel } from "./components/table/model/useTableSceneModel";
export type { TableSceneModel } from "./components/table/model/useTableSceneModel";
export {
  ALL_IN_COPY,
  YOUR_MOVE_COPY,
  deriveTableViewState,
} from "./components/table/model/deriveTableViewState";
export type { TableViewState, TableRenderPhase } from "./components/table/model/deriveTableViewState";
export { getFeltImageSource } from "./components/table/feltImages";
export type { FeltImageId } from "./components/table/feltImages";
export { getCardFaceSource, keyToRankSuit, getCardBackSource } from "./components/table/cardFaceAssets";
export * from "./components/table/tableScene.orchestration";
export {
  LAYOUT_GAME_TOP_BAR_HEIGHT,
  GAME_AREA_HEIGHT,
  HERO_ZONE_HEIGHT,
  TABLE_REVEAL_MS,
} from "./components/table/constants/table-layout.constants";

export { useResolvedBuyIn } from "./components/table/hooks/useResolvedBuyIn";
export { useTableScene } from "./components/table/hooks/useTableScene";
export { useTableDisplayEvents } from "./components/table/hooks/useTableDisplayEvents";
export { useRebuySheet } from "./components/table/hooks/useRebuySheet";
export { useAddBot } from "./components/table/hooks/useAddBot";
export { useVoiceControllerLifecycle } from "./components/table/hooks/useVoiceControllerLifecycle";
export { peerIdsFromSeats } from "./components/table/hooks/useVoiceControllerLifecycle";
export { useVoiceJoinPolicy } from "./components/table/hooks/useVoiceJoinPolicy";
export { useOpenTableSync } from "./components/table/hooks/useOpenTableSync";
export { useTableConnection } from "./components/table/hooks/useTableConnection";
export { usePlayerJoinedSound } from "./components/table/hooks/usePlayerJoinedSound";
export { BoardArea } from "./components/table/board-area/BoardArea";
export { TableStatusStrip } from "./components/table/action-bar/TableStatusStrip";
export type { TableStatusStripProps } from "./components/table/action-bar/TableStatusStrip";
