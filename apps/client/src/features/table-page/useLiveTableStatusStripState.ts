import { useEffect, useMemo, useReducer, useRef } from "react";
import type { UiCard, ActionNotice } from "@/features/table/display";
import type { TableDisplayState } from "./tableDisplayState";

export type LiveTableStatusPhase =
  | "inHand"
  | "winnerHold"
  | "boardReset"
  | "betweenHands"
  | "transport";

export const DEALING_NEXT_HAND_COPY = "Dealing next hand...";
export const TOURNAMENT_FINISHED_COPY = "Tournament complete";

export const MIN_MESSAGE_DURATION_MS = 400;
export const WINNER_HOLD_MS = 900;
export const BOARD_RESET_FADE_MS = 180;
export const TERMINAL_TIMEOUT_MS = 3000;

const FACE_DOWN_BOARD_CARDS: UiCard[] = Array(5).fill(null);

type InternalPhase = Exclude<LiveTableStatusPhase, "transport">;

type LiveTableStatusInputs = {
  tableId: string;
  displayState: TableDisplayState;
  tournamentStatus?: string | null;
  debugNowTs?: number;
};

type NoticeFingerprint = {
  handId: string;
  key: string;
  message: string;
};

type OpponentNoticeForHand = {
  handId: string;
  notice: ActionNotice;
};

type StatusMachineState = {
  tableId: string;
  observedHandId: string | null;
  phase: InternalPhase;
  phaseStartedAtTs: number | null;
  terminalStartedAtTs: number | null;
  latchedCompletedHandId: string | null;
  activeNotice: ActionNotice | null;
  activeNoticeStartedAtTs: number | null;
  queuedNotice: ActionNotice | null;
  lastProcessedNotice: NoticeFingerprint | null;
  lastOpponentNoticeForHand: OpponentNoticeForHand | null;
  displayedMessage: string;
  displayedMessageTableId: string | null;
  displayedMessageHandId: string | null;
};

type TickAction = {
  type: "TICK";
  now: number;
  inputs: LiveTableStatusInputs;
};

export type LiveTableStatusStripState = {
  message: string;
  showSpinner: boolean;
  showTurnCue: boolean;
  statusPhase: LiveTableStatusPhase;
  boardCardsOverride: UiCard[] | null;
  potCentsOverride?: number;
  hideDealerFooter: boolean;
};

function createInitialState(tableId: string): StatusMachineState {
  return {
    tableId,
    observedHandId: null,
    phase: "inHand",
    phaseStartedAtTs: null,
    terminalStartedAtTs: null,
    latchedCompletedHandId: null,
    activeNotice: null,
    activeNoticeStartedAtTs: null,
    queuedNotice: null,
    lastProcessedNotice: null,
    lastOpponentNoticeForHand: null,
    displayedMessage: "",
    displayedMessageTableId: null,
    displayedMessageHandId: null,
  };
}

function isDuplicateNotice(
  lastProcessedNotice: NoticeFingerprint | null,
  actionNotice: ActionNotice,
): boolean {
  if (!lastProcessedNotice || lastProcessedNotice.handId !== actionNotice.handId) {
    return false;
  }
  return (
    lastProcessedNotice.key === actionNotice.key ||
    lastProcessedNotice.message === actionNotice.message
  );
}

function showNotice(
  state: StatusMachineState,
  actionNotice: ActionNotice,
  tableId: string,
  now: number,
): StatusMachineState {
  return {
    ...state,
    activeNotice: actionNotice,
    activeNoticeStartedAtTs: now,
    queuedNotice: null,
    displayedMessage: actionNotice.message,
    displayedMessageTableId: tableId,
    displayedMessageHandId: actionNotice.handId,
  };
}

function enterBetweenHands(
  state: StatusMachineState,
  now: number,
): StatusMachineState {
  return {
    ...state,
    phase: "betweenHands",
    phaseStartedAtTs: now,
    displayedMessage: DEALING_NEXT_HAND_COPY,
    displayedMessageTableId: state.tableId,
    displayedMessageHandId: state.latchedCompletedHandId,
    activeNotice: null,
    activeNoticeStartedAtTs: null,
    queuedNotice: null,
    lastOpponentNoticeForHand: null,
  };
}

function maybePromoteQueuedNotice(
  state: StatusMachineState,
  tableId: string,
  now: number,
): StatusMachineState {
  if (
    !state.queuedNotice ||
    state.phase !== "inHand" ||
    state.activeNoticeStartedAtTs == null ||
    now - state.activeNoticeStartedAtTs < MIN_MESSAGE_DURATION_MS
  ) {
    return state;
  }
  return showNotice(state, state.queuedNotice, tableId, now);
}

function applyActionNotice(
  state: StatusMachineState,
  actionNotice: ActionNotice,
  heroUserId: string | undefined,
  tableId: string,
  now: number,
): StatusMachineState {
  if (isDuplicateNotice(state.lastProcessedNotice, actionNotice)) {
    return state;
  }

  const nextProcessedNotice: NoticeFingerprint = {
    handId: actionNotice.handId,
    key: actionNotice.key,
    message: actionNotice.message,
  };
  const nextOpponentNotice =
    actionNotice.actorUserId != null &&
    heroUserId != null &&
    actionNotice.actorUserId !== heroUserId
      ? { handId: actionNotice.handId, notice: actionNotice }
      : state.lastOpponentNoticeForHand;

  const activeNoticeExpired =
    state.activeNotice == null ||
    state.activeNotice.handId !== actionNotice.handId ||
    state.activeNoticeStartedAtTs == null ||
    now - state.activeNoticeStartedAtTs >= MIN_MESSAGE_DURATION_MS;

  const baseState: StatusMachineState = {
    ...state,
    lastProcessedNotice: nextProcessedNotice,
    lastOpponentNoticeForHand: nextOpponentNotice,
  };

  if (activeNoticeExpired) {
    return showNotice(baseState, actionNotice, tableId, now);
  }

  return {
    ...baseState,
    queuedNotice: actionNotice,
  };
}

function resolvePhaseTransitions(
  state: StatusMachineState,
  inputs: LiveTableStatusInputs,
  currentHandId: string | null,
  now: number,
): StatusMachineState {
  const enteredNewHand =
    inputs.displayState.phase === "inHand" &&
    state.latchedCompletedHandId != null &&
    currentHandId != null &&
    currentHandId !== state.latchedCompletedHandId;
  if (enteredNewHand) {
    return {
      ...state,
      observedHandId: currentHandId,
      phase: "inHand",
      phaseStartedAtTs: null,
      terminalStartedAtTs: null,
      activeNotice: null,
      activeNoticeStartedAtTs: null,
      queuedNotice: null,
      displayedMessage: "",
      displayedMessageHandId: currentHandId,
    };
  }

  if (state.phase === "winnerHold") {
    const terminalElapsed =
      state.terminalStartedAtTs == null ? 0 : now - state.terminalStartedAtTs;
    if (terminalElapsed >= TERMINAL_TIMEOUT_MS) {
      return enterBetweenHands(state, now);
    }
    const holdElapsed =
      state.phaseStartedAtTs == null ? 0 : now - state.phaseStartedAtTs;
    if (
      holdElapsed >= WINNER_HOLD_MS &&
      inputs.displayState.boardReset
    ) {
      return {
        ...state,
        phase: "boardReset",
        phaseStartedAtTs: now,
        activeNotice: null,
        activeNoticeStartedAtTs: null,
        queuedNotice: null,
      };
    }
    return state;
  }

  if (state.phase === "boardReset") {
    const terminalElapsed =
      state.terminalStartedAtTs == null ? 0 : now - state.terminalStartedAtTs;
    const resetElapsed =
      state.phaseStartedAtTs == null ? 0 : now - state.phaseStartedAtTs;
    if (
      terminalElapsed >= TERMINAL_TIMEOUT_MS ||
      resetElapsed >= BOARD_RESET_FADE_MS
    ) {
      return enterBetweenHands(state, now);
    }
  }

  return state;
}

function resolveNextState(
  previousState: StatusMachineState,
  inputs: LiveTableStatusInputs,
  now: number,
): StatusMachineState {
  let state =
    previousState.tableId === inputs.tableId
      ? previousState
      : createInitialState(inputs.tableId);

  const currentHandId = inputs.displayState.handId;
  const handIdChanged = currentHandId !== state.observedHandId;
  const newHandStarted =
    currentHandId != null &&
    (state.latchedCompletedHandId != null
      ? currentHandId !== state.latchedCompletedHandId
      : handIdChanged);

  if (newHandStarted) {
    state = {
      ...state,
      observedHandId: currentHandId,
      phase: "inHand",
      phaseStartedAtTs: null,
      terminalStartedAtTs: null,
      activeNotice: null,
      activeNoticeStartedAtTs: null,
      queuedNotice: null,
      lastOpponentNoticeForHand: null,
    };
  } else if (
    state.lastOpponentNoticeForHand &&
    state.lastOpponentNoticeForHand.handId !== currentHandId
  ) {
    state = {
      ...state,
      observedHandId: currentHandId,
      lastOpponentNoticeForHand: null,
    };
  } else if (handIdChanged) {
    state = {
      ...state,
      observedHandId: currentHandId,
    };
  }

  if (
    inputs.displayState.winnerMessage &&
    inputs.displayState.completedHandId &&
    inputs.displayState.completedHandId !== state.latchedCompletedHandId &&
    (currentHandId == null || currentHandId === inputs.displayState.completedHandId)
  ) {
    return {
      ...state,
      phase: "winnerHold",
      phaseStartedAtTs: now,
      terminalStartedAtTs: now,
      latchedCompletedHandId: inputs.displayState.completedHandId,
      displayedMessage: inputs.displayState.winnerMessage,
      displayedMessageTableId: inputs.tableId,
      displayedMessageHandId: inputs.displayState.completedHandId,
      activeNotice: null,
      activeNoticeStartedAtTs: null,
      queuedNotice: null,
    };
  }

  state = resolvePhaseTransitions(state, inputs, currentHandId, now);

  if (state.phase !== "inHand") {
    return state;
  }

  if (
    inputs.displayState.notice &&
    inputs.displayState.notice.handId === currentHandId
  ) {
    state = applyActionNotice(
      state,
      inputs.displayState.notice,
      inputs.displayState.heroUserId ?? undefined,
      inputs.tableId,
      now,
    );
  }

  return maybePromoteQueuedNotice(state, inputs.tableId, now);
}

function statusStripReducer(
  state: StatusMachineState,
  action: TickAction,
): StatusMachineState {
  return resolveNextState(state, action.inputs, action.now);
}

function getNextTimerAt(
  state: StatusMachineState,
  inputs: LiveTableStatusInputs,
): number | null {
  const currentHandId = inputs.displayState.handId;

  if (
    state.phase === "inHand" &&
    state.queuedNotice &&
    state.activeNoticeStartedAtTs != null
  ) {
    return state.activeNoticeStartedAtTs + MIN_MESSAGE_DURATION_MS;
  }

  if (state.phase === "winnerHold") {
    if (
      inputs.displayState.boardReset &&
      state.phaseStartedAtTs != null
    ) {
      return state.phaseStartedAtTs + WINNER_HOLD_MS;
    }
    if (state.terminalStartedAtTs != null) {
      return state.terminalStartedAtTs + TERMINAL_TIMEOUT_MS;
    }
  }

  if (state.phase === "boardReset") {
    const timerCandidates: number[] = [];
    if (state.phaseStartedAtTs != null) {
      timerCandidates.push(state.phaseStartedAtTs + BOARD_RESET_FADE_MS);
    }
    if (state.terminalStartedAtTs != null) {
      timerCandidates.push(state.terminalStartedAtTs + TERMINAL_TIMEOUT_MS);
    }
    return timerCandidates.length > 0 ? Math.min(...timerCandidates) : null;
  }

  return null;
}

function resolveInHandMessage(
  state: StatusMachineState,
  inputs: LiveTableStatusInputs,
  currentHandId: string | null,
): string {
  const safeDisplayedMessage =
    state.displayedMessageTableId === inputs.tableId &&
    state.displayedMessageHandId === currentHandId
      ? state.displayedMessage
      : "";

  if (inputs.displayState.showTurnCue) {
    if (
      state.lastOpponentNoticeForHand &&
      state.lastOpponentNoticeForHand.handId === currentHandId
    ) {
      return state.lastOpponentNoticeForHand.notice.message;
    }
    if (state.activeNotice && state.activeNotice.handId === currentHandId) {
      return state.activeNotice.message;
    }
    return (
      safeDisplayedMessage ||
      inputs.displayState.heroPrompt ||
      inputs.displayState.passiveMessage ||
      "Hand in progress"
    );
  }

  if (state.activeNotice && state.activeNotice.handId === currentHandId) {
    return state.activeNotice.message;
  }

  return (
    safeDisplayedMessage ||
    inputs.displayState.heroPrompt ||
    inputs.displayState.passiveMessage ||
    "Hand in progress"
  );
}

function resolveDerivedState(
  state: StatusMachineState,
  inputs: LiveTableStatusInputs,
  _now: number,
): LiveTableStatusStripState {
  const currentHandId = inputs.displayState.handId;
  const transportMessage = inputs.displayState.connectionLabel;

  const statusPhase: LiveTableStatusPhase =
    transportMessage != null ? "transport" : state.phase;

  let message: string;
  if (transportMessage != null) {
    message = transportMessage;
  } else if (state.phase === "betweenHands") {
    message =
      inputs.tournamentStatus === "FINISHED" ||
      inputs.tournamentStatus === "ABANDONED" ||
      inputs.tournamentStatus === "CANCELLED"
        ? TOURNAMENT_FINISHED_COPY
        : DEALING_NEXT_HAND_COPY;
  } else if (state.phase === "winnerHold" || state.phase === "boardReset") {
    message = state.displayedMessage;
  } else {
    message = resolveInHandMessage(state, inputs, currentHandId);
  }

  const showSpinner =
    transportMessage != null ||
    state.phase === "betweenHands";
  const showBoardOverride =
    state.phase === "boardReset" || state.phase === "betweenHands";

  return {
    message,
    showSpinner,
    showTurnCue: inputs.displayState.showTurnCue,
    statusPhase,
    boardCardsOverride: showBoardOverride ? FACE_DOWN_BOARD_CARDS : null,
    potCentsOverride: showBoardOverride ? 0 : undefined,
    hideDealerFooter: true,
  };
}

function devTrace(event: string, payload: Record<string, unknown>) {
  if (!__DEV__) {
    return;
  }
  console.debug("[live-status-strip]", event, payload);
}

export function useLiveTableStatusStripState(
  rawInputs: LiveTableStatusInputs,
): LiveTableStatusStripState {
  const inputs = useMemo(
    () => rawInputs,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally listing individual fields for stable reference semantics
    [
      rawInputs.debugNowTs,
      rawInputs.displayState,
      rawInputs.tableId,
    ],
  );
  const [state, dispatch] = useReducer(
    statusStripReducer,
    inputs.tableId,
    createInitialState,
  );
  const previousStateRef = useRef(state);
  const previousDerivedRef = useRef<LiveTableStatusStripState | null>(null);

  useEffect(() => {
    dispatch({ type: "TICK", now: inputs.debugNowTs ?? Date.now(), inputs });
  }, [inputs]);

  useEffect(() => {
    if (inputs.debugNowTs != null) {
      return undefined;
    }
    const nextTimerAt = getNextTimerAt(state, inputs);
    if (nextTimerAt == null) {
      return undefined;
    }
    const delayMs = Math.max(0, nextTimerAt - Date.now());
    const timerId = setTimeout(() => {
      dispatch({ type: "TICK", now: Date.now(), inputs });
    }, delayMs);
    return () => clearTimeout(timerId);
  }, [inputs, state]);

  const derivedState = useMemo(
    () => resolveDerivedState(state, inputs, inputs.debugNowTs ?? Date.now()),
    [inputs, state],
  );

  useEffect(() => {
    const previousState = previousStateRef.current;
    if (previousState.phase !== state.phase) {
      devTrace("phase-change", {
        tableId: inputs.tableId,
        from: previousState.phase,
        to: state.phase,
        currentHandId: inputs.displayState.handId,
        completedHandId: state.latchedCompletedHandId,
      });
    }
    if (
      previousState.queuedNotice?.key &&
      state.queuedNotice?.key &&
      previousState.queuedNotice.key !== state.queuedNotice.key
    ) {
      devTrace("queued-notice-replaced", {
        tableId: inputs.tableId,
        previousQueuedKey: previousState.queuedNotice.key,
        nextQueuedKey: state.queuedNotice.key,
      });
    }
    if (
      (previousState.phase === "winnerHold" || previousState.phase === "boardReset") &&
      state.phase === "inHand" &&
      inputs.displayState.handId
    ) {
      devTrace("terminal-cancelled-early-new-hand", {
        tableId: inputs.tableId,
        currentHandId: inputs.displayState.handId,
        completedHandId: previousState.latchedCompletedHandId,
      });
    }
    previousStateRef.current = state;
  }, [inputs.displayState.handId, inputs.tableId, state]);

  useEffect(() => {
    previousDerivedRef.current = derivedState;
  }, [derivedState]);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    if (derivedState.message.trim().length > 0) {
      return;
    }
    console.warn("Empty status strip state", {
      tableId: inputs.tableId,
      statusPhase: derivedState.statusPhase,
      connectionStatus: inputs.displayState.connectionLabel ?? "CONNECTED",
      handId: inputs.displayState.handId,
    });
  }, [
    derivedState.message,
    derivedState.statusPhase,
    inputs.displayState.connectionLabel,
    inputs.displayState.handId,
    inputs.tableId,
  ]);

  return derivedState;
}
