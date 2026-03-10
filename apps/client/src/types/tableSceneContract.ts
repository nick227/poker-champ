import type { ReactNode } from "react";
import type { TableSnapshotPayload, BotSummary } from "@poker-champ/realtime-contract";
import type { TableSceneModel } from "@/features/table";
import type { TableSceneMode } from "@/features/table";
import type { Opponent } from "@/features/table";
import type { TableAction } from "@/features/table";
import type { ChatMessageForOverlay } from "@/components/domain/chat/types";
import type { HandResultMessage, ConnectionStatus } from "@/features/table";
import type { RejoinUiState } from "@/features/table";
import type { TableAnimationRequest } from "@/features/table/animations/tableAnimation.types";

export type TableSceneContract = {
  snapshot: TableSnapshotPayload;
  sceneModel: TableSceneModel;
};

export type ActiveTableRow = {
  id: string;
  potCents: number;
  bankCents: number;
  betCents: number;
  isYourTurn: boolean;
};

export type TablePageController = {
  scene: {
    mode: TableSceneMode;
    tableNextPath: string;
    hasValidBuyIn: boolean;
    tableStatus: string;
    connectionStatus: ConnectionStatus;
    tableError?: string;
  };
  renderModel: {
    tableId: string;
    openTableIds: string[];
    activeTableId?: string | null;
    profileUsername?: string;
    /** Current user avatar (profile/me); hero zone uses this when snapshot has no avatar yet. */
    currentUserAvatarUrl?: string | null;
    balanceCents: number;
    snapshot?: TableSnapshotPayload;
    opponents: Opponent[];
    actionMessage?: string;
    handResultMessage?: HandResultMessage;
    canRebuy: boolean;
    tableTopBarRight: ReactNode;
    activeTableRows: ActiveTableRow[];
    chatMessages: ChatMessageForOverlay[];
    chatVisible: boolean;
    botSummaries: BotSummary[];
    rejoinUiState: RejoinUiState;
    rejoinErrorMessage?: string | null;
    /** Current animation request; overlay consumes and clears via onComplete. */
    animationRequest: TableAnimationRequest | null;
  };
  uiState: {
    activeTablesDropdownVisible: boolean;
    themePickerVisible: boolean;
    rebuySheetVisible: boolean;
    botPickerVisible: boolean;
    botPickerLoading: boolean;
    playerPopup: { name: string } | null;
  };
  actions: {
    goToLogin: () => void;
    goToLobby: () => void;
    closeTableAndReturn: () => void;
    selectTableFromDropdown: (targetId: string) => void;
    selectTableTab: (targetId: string) => void;
    openMoreTables: () => void;
    closeActiveTablesDropdown: () => void;
    openThemePicker: () => void;
    closeThemePicker: () => void;
    closeBotPicker: () => void;
    openRebuySheet: () => void;
    closeRebuySheet: () => void;
    applyRebuy: (buyInCents: number) => void;
    closePlayerPopup: () => void;
    onPlayerPress: (opponent: Opponent) => void;
    openAddBotPicker: () => void;
    pickBot: (botId: string) => void;
    sendAction: (payload: { type: TableAction; amount?: number }) => void;
    toggleHeroSittingOut: () => void;
    rejoinHero: () => void;
    joinTableFromFallback: () => void;
    closeChat: () => void;
    sendChat: (text: string) => void;
    requestTableAnimation: (request: TableAnimationRequest) => void;
    clearAnimationRequest: () => void;
  };
};

