import type { ReactNode } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { ActionBarOnAction } from "@/components/domain/table/ActionBar";
import type { TableSceneModel } from "@/components/domain/table/hooks/useTableSceneModel";
import type { TableSceneMode } from "@/components/domain/table/tableScene.orchestration";
import type { Opponent } from "@/components/domain/table/TableLayout";
import type { TableAction } from "@/components/domain/table/ActionBar";
import type { ChatMessageForOverlay } from "@/components/domain/table/hooks/useChatOverlay";
import type { HandResultMessage, ConnectionStatus } from "@/components/domain/table/TableLayout";

export type TableSceneChromeSlots = {
  topBarLeft?: ReactNode;
  topBarRight?: ReactNode;
};

export type TableSceneContract = {
  snapshot: TableSnapshotPayload;
  sceneModel: TableSceneModel;
  onAction?: ActionBarOnAction;
  chrome?: TableSceneChromeSlots;
};

export type ActiveTableRow = {
  id: string;
  potCents: number;
  bankCents: number;
  betCents: number;
  isYourTurn: boolean;
};

export type TableScreenController = {
  scene: {
    mode: TableSceneMode;
    tableNextPath: string;
    hasValidBuyIn: boolean;
    tableStatus: string;
    connectionStatus: ConnectionStatus;
    tableError?: string;
  };
  renderModel: {
    openTableIds: string[];
    activeTableId?: string | null;
    profileUsername?: string;
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
  };
  uiState: {
    activeTablesDropdownVisible: boolean;
    themePickerVisible: boolean;
    rebuySheetVisible: boolean;
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
    openRebuySheet: () => void;
    closeRebuySheet: () => void;
    applyRebuy: (buyInCents: number) => void;
    closePlayerPopup: () => void;
    onPlayerPress: (opponent: Opponent) => void;
    sendAction: (payload: { type: TableAction; amount?: number }) => void;
    closeChat: () => void;
    sendChat: (text: string) => void;
  };
};
