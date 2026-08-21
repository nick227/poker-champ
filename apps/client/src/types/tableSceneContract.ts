import type { ReactNode } from "react";
import type { TableSnapshotPayload, BotSummary, GiftReceivedPayload } from "@poker-champ/realtime-contract";
import type { SideBetEntry } from "@/features/table/stores/table.store";
import type { TableSceneModel } from "@/features/table";
import type { TableSceneMode } from "@/features/table";
import type { TableLoadPhase } from "@/lib/tableLoadPhase";
import type { Opponent } from "@/features/table";
import type { TableAction } from "@/features/table";
import type { ChatMessageForOverlay } from "@/components/domain/chat/types";
import type { ConnectionStatus, TableDisplayEvents } from "@/features/table";
import type { RejoinUiState } from "@/features/table";
import type {
  TableAnimationRequest,
  AnchorBounds,
  Rect,
} from "@/features/table/animations/animationTypes";
import type { ChipTravelPlan } from "@/features/table/animations/chipTravel";
import type { PendingAction } from "@/features/table/stores/multitable.store";

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
    loadPhase: TableLoadPhase;
    showLoadRecovery: boolean;
    loadStatusMessage: string;
    loadRecoveryBusy: boolean;
    /** Recover table action (tournament ensure-table or cash resume API). */
    canRecoverTable: boolean;
    realtimeRoomId: string;
    tableNextPath: string;
    hasValidBuyIn: boolean;
    tableStatus: string;
    connectionStatus: ConnectionStatus;
    tableError?: string;
    loadDevDiagnostics?: string;
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
    displayEvents: TableDisplayEvents;
    pendingAction?: PendingAction;
    giftFeed: GiftReceivedPayload[];
    sideBets: Record<string, SideBetEntry>;
    bigBlindCents?: number;
    heroUserId?: string;
    canRebuy: boolean;
    leaveTournamentBusy: boolean;
    tableTopBarRight: ReactNode;
    activeTableRows: ActiveTableRow[];
    chatMessages: ChatMessageForOverlay[];
    chatVisible: boolean;
    botSummaries: BotSummary[];
    rejoinUiState: RejoinUiState;
    rejoinErrorMessage?: string | null;
    /** Current animation request; overlay consumes and clears via onComplete. */
    animationRequest: TableAnimationRequest | null;
    tournamentStandingsVisible: boolean;
    /**
     * Measured bounds for BOARD/SEAT/HERO/CARD anchors; overlay uses for positioned FX.
     * Must be in overlay coordinate space (e.g. measureLayout(overlayRef), not raw measureInWindow).
     */
    anchorBounds?: AnchorBounds;
    /** Active bet→pot / pot→winner chip-travel animations; overlay renders and reports completion. */
    chipTravelRequests: ChipTravelPlan[];
    /** Active gift animations. */
    giftTravelRequests: import("@/features/table/animations/GiftTravelOverlay").GiftTravelPlan[];
  };
  uiState: {
    activeTablesDropdownVisible: boolean;
    themePickerVisible: boolean;
    handHistoryVisible: boolean;
    rebuySheetVisible: boolean;
    botPickerVisible: boolean;
    botPickerLoading: boolean;
    playerPopup: { name: string; userId: string } | null;
    seatInteraction: { name: string; userId: string } | null;
  };
  actions: {
    goToLogin: () => void;
    goToLobby: () => void;
    retryTableLoad: () => void;
    recoverTableLoad: () => void;
    closeTableAndReturn: () => void;
    selectTableFromDropdown: (targetId: string) => void;
    selectTableTab: (targetId: string) => void;
    openMoreTables: () => void;
    closeActiveTablesDropdown: () => void;
    openThemePicker: () => void;
    closeThemePicker: () => void;
    openHandHistory: () => void;
    closeHandHistory: () => void;
    closeBotPicker: () => void;
    openRebuySheet: () => void;
    closeRebuySheet: () => void;
    applyRebuy: (buyInCents: number) => void;
    leaveTournament: () => void;
    closePlayerPopup: () => void;
    onPlayerPress: (opponent: Opponent) => void;
    onSeatInteractPress: (opponent: Opponent) => void;
    closeSeatInteraction: () => void;
    sendGift: (input: { recipientUserId: string; catalogKey: string }) => boolean;
    proposeSideBet: (input: {
      recipientUserId: string;
      catalogKey: string;
      stakeCents: number;
      subjectUserIds?: [string, string];
      predictedSubjectUserId?: string;
    }) => boolean;
    respondSideBet: (input: { interactionId: string; accept: boolean }) => boolean;
    cancelSideBet: (interactionId: string) => boolean;
    openAddBotPicker: () => void;
    pickBot: (botId: string) => void;
    sendAction: (payload: { type: TableAction; amount?: number }) => boolean;
    toggleHeroSittingOut: () => void;
    rejoinHero: () => void;
    joinTableFromFallback: () => void;
    closeChat: () => void;
    sendChat: (text: string) => void;
    requestTableAnimation: (request: TableAnimationRequest) => void;
    clearAnimationRequest: () => void;
    /** Report board rect. Enables BOARD-anchored FX. Use overlay coordinate space. */
    reportBoardBounds: (rect: Rect) => void;
    /** Report hero zone rect. Enables RING/GLOW anchor: HERO. Use overlay coordinate space. */
    reportHeroBounds: (rect: Rect) => void;
    /** Report seat rect by index. Enables RING/GLOW anchor: SEAT (e.g. winnerSeat). Use overlay coordinate space. */
    reportSeatBounds: (seatIndex: number, rect: Rect) => void;
    /** Report community card slot rect (0..4). Enables CARD-anchored FX. Use overlay coordinate space. */
    reportCardSlotBounds: (index: number, rect: Rect) => void;
    /** Called by ChipTravelOverlay when a chip-travel animation finishes; removes it from the queue. */
    completeChipTravel: (id: string) => void;
    /** Called by GiftTravelOverlay when a gift animation finishes; removes it from the queue. */
    completeGiftTravel: (id: string) => void;
    openTournamentStandings: () => void;
    closeTournamentStandings: () => void;
  };
};

