export { TableTopNavMenu } from "./components/table/TableTopNavMenu";
export { PlayerHistoryPopup } from "./components/table/PlayerHistoryPopup";
export { ActiveTablesDropdown } from "./components/table/ActiveTablesDropdown";
export { BotPickerSheet } from "./components/table/BotPickerSheet";
export { ThemePickerSheet } from "./components/table/ThemePickerSheet";
export { RejoinCTA } from "./components/table/RejoinCTA";
export type { RejoinUiState } from "./components/table/RejoinCTA";

export {
  buildSeatContext,
  getHeroDisplayStatus,
  mapSeatsToOpponents,
  getHeroStackCents,
  getPotCents,
} from "./components/table/table.adapter";
export type { Opponent } from "./components/table/table.adapter";

export { ActiveTableView } from "./components/table/views/ActiveTableView";
export { EmptyTableView } from "./components/table/views/EmptyTableView";
export { StatusTableView } from "./components/table/views/StatusTableView";

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
export type { ActionBarProps, ActionBarOnAction, TableAction } from "./components/table/action-bar/ActionBar";
export { ACTION_BAR_HEIGHT } from "./components/table/action-bar/ActionBar";

export type { HandResultMessage, ConnectionStatus } from "./components/table/table.types";
export { buildTableSceneModel, useTableSceneModel } from "./components/table/model/useTableSceneModel";
export type { TableSceneModel } from "./components/table/model/useTableSceneModel";
export { getFeltImageSource } from "./components/table/feltImages";
export type { FeltImageId } from "./components/table/feltImages";
export { getCardFaceSource, keyToRankSuit, getCardBackSource } from "./components/table/cardFaceAssets";
export * from "./components/table/tableScene.orchestration";
export {
  LAYOUT_GAME_TOP_BAR_HEIGHT,
  GAME_AREA_HEIGHT,
  HERO_ZONE_HEIGHT,
} from "./components/table/constants/table-layout.constants";

export { useResolvedBuyIn } from "./components/table/hooks/useResolvedBuyIn";
export { useTableScene } from "./components/table/hooks/useTableScene";
export { useActionMessages } from "./components/table/hooks/useActionMessages";
export { useRebuySheet } from "./components/table/hooks/useRebuySheet";
export { useAddBot } from "./components/table/hooks/useAddBot";
export { useVoiceControllerLifecycle } from "./components/table/hooks/useVoiceControllerLifecycle";
export { peerIdsFromSeats } from "./components/table/hooks/useVoiceControllerLifecycle";
export { useVoiceJoinPolicy } from "./components/table/hooks/useVoiceJoinPolicy";
export { useOpenTableSync } from "./components/table/hooks/useOpenTableSync";
export { useTableConnection } from "./components/table/hooks/useTableConnection";
export { usePlayerJoinedSound } from "./components/table/hooks/usePlayerJoinedSound";
