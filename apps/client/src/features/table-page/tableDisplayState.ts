import {
  buildWinnerMessageText,
  type ActionNotice,
  type HandResultMessage,
  type TableViewState,
} from "@/features/table/display";

export type TableDisplayPhase =
  | "inHand"
  | "winnerHold"
  | "betweenHands"
  | "transport";

export type TableDisplayState = {
  phase: TableDisplayPhase;
  handId: string | null;
  completedHandId: string | null;
  heroUserId: string | null;
  notice: ActionNotice | null;
  winnerMessage: string | null;
  heroPrompt: string | null;
  passiveMessage: string | null;
  showTurnCue: boolean;
  boardReset: boolean;
  connectionLabel: string | null;
};

export const RECONNECTING_COPY = "Reconnecting...";
export const DISCONNECTED_COPY = "Disconnected...";

export type DeriveTableDisplayStateOptions = {
  formatChipAmount?: (amount: number) => string;
};

export function deriveTableDisplayState({
  viewState,
  actionNotice,
  handResultNotice,
  formatChipAmount,
}: {
  viewState: TableViewState;
  actionNotice: ActionNotice | null;
  handResultNotice: HandResultMessage | null;
} & DeriveTableDisplayStateOptions): TableDisplayState {
  const winnerMessage = buildWinnerMessageText(handResultNotice, formatChipAmount);
  const completedHandId = handResultNotice?.handId ?? null;

  let phase: TableDisplayPhase = "betweenHands";
  if (viewState.connectionLabel != null) {
    phase = "transport";
  } else if (
    winnerMessage != null &&
    (viewState.handId == null || viewState.handId === completedHandId)
  ) {
    phase = "winnerHold";
  } else if (viewState.handId != null) {
    phase = "inHand";
  }

  return {
    phase,
    handId: viewState.handId,
    completedHandId,
    heroUserId: viewState.heroUserId,
    notice: actionNotice,
    winnerMessage,
    heroPrompt: viewState.heroPrompt,
    passiveMessage: viewState.passiveMessage,
    showTurnCue: viewState.turnCue,
    boardReset:
      phase === "winnerHold" &&
      (viewState.boardResetEligible ||
        (winnerMessage != null && viewState.handId == null)),
    connectionLabel: viewState.connectionLabel,
  };
}
