import { useCallback, useEffect, useMemo, useReducer } from "react";
import { formatCents } from "@/lib/format";
import { TABLE } from "@/constants/copy";
import type { HeroActionOptions } from "@poker-champ/realtime-contract";
import type { HeroStatus } from "../table.adapter";
import {
  ActionContext,
  formatInputFromCents,
  getActionBarPermissions,
  parseInputToCents,
  normalizeMoneyInput,
  useWagerCalculations,
} from "./actionBar.logic";
import type { ActionBarPermissions } from "./actionBar.logic";
import {
  wagerReducer,
  initialWagerState,
} from "./actionBar.wagerReducer";

const HERO_STATUS_LABEL: Record<HeroStatus, string> = {
  ACTIVE: TABLE.waitingForYourTurn,
  FOLDED: TABLE.youFolded,
  ALL_IN: TABLE.youAreAllIn,
  SITTING_OUT: TABLE.sittingOut,
  RECONNECTING: TABLE.reconnecting,
};

/** Strict shape for action bar permission checks. UI uses this only. */
export type Permissions = ActionBarPermissions;

/** Strict shape for action handlers. UI calls these; no other contract. */
export type ActionHandlers = {
  fold: () => void;
  checkCall: () => void;
  betRaise: () => void;
  setMin: () => void;
  halfPot: () => void;
  pot: () => void;
  max: () => void;
  allIn: () => void;
};

/** Wager UI state grouped to reduce controller/UI coupling. */
export type Wager = {
  display: string;
  placeholder: string;
  label: string;
  disabled: boolean;
  visible: boolean;
};

export type ActionBarController = {
  statusLabel: string;
  checkCallLabel: string;
  showActions: boolean;
  showReconnectingOverlay: boolean;
  permissions: Permissions;
  actions: ActionHandlers;
  wager: Wager;
  handleBetInputChange: (text: string) => void;
  normalizeBetInput: () => number;
};

export type ActionBarControllerParams = {
  actionContext: ActionContext;
  heroStatus: HeroStatus;
  actionOptions?: HeroActionOptions;
  potCents?: number;
  onAction: (payload: { type: "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN"; amount?: number }) => void;
};

export function useActionBarController(params: ActionBarControllerParams): ActionBarController {
  const { actionContext, heroStatus, actionOptions, potCents = 0, onAction } = params;
  const { showActions, wager, capabilities } = actionContext;
  const permissions = useMemo(() => getActionBarPermissions(actionContext), [actionContext]);

  const [wagerState, dispatch] = useReducer(
    wagerReducer,
    wager?.bounds.min ?? 0,
    (minCents) => initialWagerState(minCents),
  );

  useEffect(() => {
    if (!wager) {
      dispatch({ type: "RESET_TO_MIN", min: 0 });
      return;
    }
    dispatch({ type: "RESET_TO_MIN", min: wager.bounds.min });
  }, [wager?.bounds.min, wager?.bounds.max]);

  const wagerCalculations = useWagerCalculations(wager, potCents);
  const { display } = wagerState;
  const parsedDisplayCents = useMemo(() => parseInputToCents(display), [display]);
  const resolvedFromDisplay = useMemo(
    () => (wager && parsedDisplayCents > 0 ? wager.resolveAmount(parsedDisplayCents) : 0),
    [wager, parsedDisplayCents],
  );

  const submitWager = useCallback(
    (rawAmount: number) => {
      if (!wager) return;
      const resolvedAmount = wager.resolveAmount(rawAmount);
      const payload = wager.buildPayload(resolvedAmount);
      if (payload) onAction(payload);
    },
    [wager, onAction],
  );

  const normalizeBetInput = useCallback((): number => {
    if (!wager) return 0;
    const parsed = parseInputToCents(display);
    const resolved = wager.resolveAmount(parsed);
    dispatch({ type: "NORMALIZE", resolve: wager.resolveAmount });
    return resolved;
  }, [wager, display]);

  const handleBetInputChange = useCallback((text: string) => {
    dispatch({ type: "SET_INPUT", display: normalizeMoneyInput(text) });
  }, []);

  const statusLabel = showActions ? TABLE.yourTurn : HERO_STATUS_LABEL[heroStatus];
  const checkCallLabel = capabilities.canCheck
    ? TABLE.check
    : capabilities.canCall
      ? `Call ${formatCents(actionOptions?.callAmount ?? 0)}`
      : `${TABLE.check}/${TABLE.bet}`;

  const enteredBelowMin = Boolean(wager && resolvedFromDisplay < wager.bounds.min);
  const betRaiseDisabled = !permissions.canWager || enteredBelowMin;
  const selectedWagerCents = wager
    ? (resolvedFromDisplay > 0 ? resolvedFromDisplay : wager.bounds.min)
    : 0;
  const primaryActionVerb = wager?.primaryVerb;
  const betRaiseVerb =
    primaryActionVerb === "RAISE" ? TABLE.raise : primaryActionVerb === "BET" ? TABLE.bet : TABLE.betRaise;
  const betRaiseLabel = `${betRaiseVerb}: ${formatCents(selectedWagerCents)}`;

  const showBetInput = showActions && !!wager && permissions.canWager;

  const handleFold = useCallback(() => {
    if (!permissions.canFold) return;
    onAction({ type: "FOLD" });
  }, [permissions.canFold, onAction]);

  const handleCheckCall = useCallback(() => {
    if (!permissions.canCheck && !permissions.canCall) return;
    if (capabilities.canCheck) onAction({ type: "CHECK" });
    else if (capabilities.canCall) onAction({ type: "CALL" });
  }, [permissions.canCheck, permissions.canCall, capabilities.canCheck, capabilities.canCall, onAction]);

  const handleBetRaise = useCallback(() => {
    if (!permissions.canWager) return;
    const amount = normalizeBetInput();
    submitWager(amount);
  }, [permissions.canWager, normalizeBetInput, submitWager]);

  const handleSetMin = useCallback(() => {
    if (wager) dispatch({ type: "RESET_TO_MIN", min: wager.bounds.min });
  }, [wager]);

  const handleHalfPot = useCallback(() => {
    if (!wagerCalculations || !permissions.canWager) return;
    const resolved = wagerCalculations.resolveAmount(wagerCalculations.calculateAmount(0.5));
    dispatch({ type: "SET_CENTS", cents: resolved });
  }, [wagerCalculations, permissions.canWager]);

  const handlePot = useCallback(() => {
    if (!wagerCalculations || !permissions.canWager) return;
    const resolved = wagerCalculations.resolveAmount(wagerCalculations.calculateAmount(1));
    dispatch({ type: "SET_CENTS", cents: resolved });
  }, [wagerCalculations, permissions.canWager]);

  const handleMax = useCallback(() => {
    if (!wager) return;
    dispatch({ type: "SET_CENTS", cents: wager.bounds.max });
  }, [wager]);

  const handleAllIn = useCallback(() => {
    if (!permissions.canAllIn) return;
    onAction({ type: "ALL_IN" });
  }, [permissions.canAllIn, onAction]);

  const actions: ActionHandlers = {
    fold: handleFold,
    checkCall: handleCheckCall,
    betRaise: handleBetRaise,
    setMin: handleSetMin,
    halfPot: handleHalfPot,
    pot: handlePot,
    max: handleMax,
    allIn: handleAllIn,
  };

  const ctrl: ActionBarController = {
    statusLabel,
    checkCallLabel,
    showActions,
    showReconnectingOverlay: Boolean(actionContext.showReconnectingOverlay),
    permissions,
    actions,
    wager: {
      display,
      placeholder: wager ? formatInputFromCents(wager.bounds.min) : "0.00",
      label: betRaiseLabel,
      disabled: betRaiseDisabled,
      visible: showBetInput,
    },
    handleBetInputChange,
    normalizeBetInput,
  };
  return ctrl;
}
