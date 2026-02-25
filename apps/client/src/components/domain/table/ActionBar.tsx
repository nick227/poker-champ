import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { ChipButton } from "@/components/base/ChipButton";
import { Input } from "@/components/base/Input";
import { formatCents } from "@/lib/format";
import { TABLE } from "@/constants/copy";
import type { HeroActionOptions } from "@poker-champ/realtime-contract";
import type { HeroStatus } from "./table.adapter";
import { ActionContext, useWagerCalculations } from "./actionBar.logic";
import {
  ACTION_BAR_PADDING,
  ACTION_BAR_GAP,
  STATUS_ROW_HEIGHT,
  BUTTONS_ROW_HEIGHT,
  BET_INPUT_ROW_HEIGHT,
  CHIPS_ROW_HEIGHT,
} from "./constants/components/actionBar.layout";
import { ACTION_BAR_HEIGHT } from "./constants/tableLayout.constants";

export { ACTION_BAR_HEIGHT };

const HERO_STATUS_LABEL: Record<HeroStatus, string> = {
  ACTIVE: TABLE.waitingForYourTurn,
  FOLDED: TABLE.youFolded,
  ALL_IN: TABLE.youAreAllIn,
  SITTING_OUT: TABLE.sittingOut,
  RECONNECTING: TABLE.reconnecting,
};

export type TableAction = "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN";

export type ActionBarOnAction = (payload: { type: TableAction; amount?: number }) => void;

export type ActionBarProps = {
  actionContext: ActionContext;
  heroStatus: HeroStatus;
  actionOptions?: HeroActionOptions;
  potCents?: number;
  onAction: ActionBarOnAction;
};

function formatInputFromCents(cents: number): string {
  return (Math.max(0, cents) / 100).toFixed(2);
}

function parseInputToCents(input: string): number {
  if (!input.trim()) return 0;
  const numeric = Number.parseFloat(input.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric * 100);
}

type BetState = {
  cents: number;
  display: string;
};

export function ActionBar({
  actionContext,
  heroStatus,
  actionOptions,
  potCents = 0,
  onAction,
}: ActionBarProps) {
  const [betState, setBetState] = useState<BetState>({ cents: 0, display: "0.00" });
  const { showActions, showReconnectingOverlay, allowedActions, capabilities, wager } = actionContext;

  // Destructure to optimize re-render sensitivity
  const { FOLD, CHECK, CALL, WAGER, ALL_IN } = allowedActions;

  // Reset bet state when wager bounds change
  // Note: wager is now memoized upstream, so effect only fires when bounds actually change
  useEffect(() => {
    if (wager) {
      const minCents = wager.bounds.min;
      setBetState({ cents: minCents, display: formatInputFromCents(minCents) });
    } else {
      setBetState({ cents: 0, display: "0.00" });
    }
  }, [wager]);

  const wagerCalculations = useWagerCalculations(wager, potCents);
  const statusLabel = showActions ? TABLE.yourTurn : HERO_STATUS_LABEL[heroStatus];
  const primaryActionVerb = wager?.primaryVerb;

  const checkCallLabel = capabilities.canCheck
    ? TABLE.check
    : capabilities.canCall
      ? `Call ${formatCents(actionOptions?.callAmount ?? 0)}`
      : `${TABLE.check}/${TABLE.bet}`;

  const canShowBetInput = showActions && wager && WAGER;

  const submitWager = useCallback(
    (rawAmount: number) => {
      if (!wager) return;
      try {
        const resolvedAmount = wager.resolveAmount(rawAmount);
        const payload = wager.buildPayload(resolvedAmount);
        if (payload) onAction(payload);
      } catch (error) {
        console.error('Error submitting wager:', error);
        // Could show user feedback here
      }
    },
    [wager, onAction],
  );

  const resolvedBetCents = wager ? wager.resolveAmount(betState.cents) : 0;

  // Note: Label updates only after blur/normalize, not during typing.
  // This prevents UI flicker from intermediate validation states.
  const normalizeBetInput = useCallback(() => {
    if (!wager) return 0;
    try {
      const parsed = parseInputToCents(betState.display);
      const resolved = wager.resolveAmount(parsed);
      setBetState({ cents: resolved, display: formatInputFromCents(resolved) });
      return resolved;
    } catch (error) {
      console.error('Invalid bet input:', error);
      // Reset to min on error
      const minCents = wager.bounds.min;
      setBetState({ cents: minCents, display: formatInputFromCents(minCents) });
      return minCents;
    }
  }, [wager, betState.display]);

  const handleBetInputChange = useCallback((text: string) => {
    // Real-time validation: only allow numeric input with decimal point
    const numericText = text.replace(/[^0-9.]/g, '');
    const parts = numericText.split('.');
    if (parts.length > 2) return; // Prevent multiple decimal points
    
    setBetState(prev => ({ ...prev, display: numericText }));
  }, []);

  const handleFold = useCallback(() => {
    if (!FOLD) return;
    onAction({ type: "FOLD" });
  }, [FOLD, onAction]);

  const handleCheckCall = useCallback(() => {
    if (!CHECK && !CALL) return;
    // Use the normalized capabilities from your context
    if (capabilities.canCheck) onAction({ type: "CHECK" });
    else if (capabilities.canCall) onAction({ type: "CALL" });
  }, [CHECK, CALL, capabilities, onAction]);

  const handleBetRaise = useCallback(() => {
    if (!WAGER) return;
    const amount = normalizeBetInput();
    submitWager(amount);
  }, [WAGER, normalizeBetInput, submitWager]);

  const handleMin = useCallback(() => {
    if (wager) {
      const minCents = wager.bounds.min;
      setBetState({ cents: minCents, display: formatInputFromCents(minCents) });
    }
  }, [wager]);

  const handleHalfPot = useCallback(() => {
    if (!wagerCalculations || !WAGER) return;
    const amount = wagerCalculations.calculateAmount(0.5);
    const resolved = wagerCalculations.resolveAmount(amount);
    submitWager(resolved);
  }, [wagerCalculations, WAGER, submitWager]);

  const handlePot = useCallback(() => {
    if (!wagerCalculations || !WAGER) return;
    const amount = wagerCalculations.calculateAmount(1);
    const resolved = wagerCalculations.resolveAmount(amount);
    submitWager(resolved);
  }, [wagerCalculations, WAGER, submitWager]);

  const handleMax = useCallback(() => {
    if (!wager) return;
    const maxCents = wager.bounds.max;
    submitWager(maxCents);
  }, [wager, submitWager]);

  const handleAllIn = useCallback(() => {
    if (!ALL_IN) return;
    onAction({ type: "ALL_IN" });
  }, [ALL_IN, onAction]);

  const enteredBelowMin = wager && resolvedBetCents < wager.bounds.min;
  const betRaiseDisabled = !WAGER || enteredBelowMin;
  const selectedWagerCents = wager
    ? (resolvedBetCents > 0 ? resolvedBetCents : wager.bounds.min)
    : 0;
  const betRaiseVerb = primaryActionVerb === "RAISE" ? TABLE.raise : primaryActionVerb === "BET" ? TABLE.bet : TABLE.betRaise;
  const betRaiseLabel = `${betRaiseVerb}: ${formatCents(selectedWagerCents)}`;

  return (
    <View
      collapsable={false}
      className="relative"
      style={{ height: ACTION_BAR_HEIGHT, paddingHorizontal: 12, width: "100%" }}
    >
      <View
        style={{
          opacity: showActions ? 1 : 0.5,
          pointerEvents: showActions ? "auto" : "none",
          padding: ACTION_BAR_PADDING,
          gap: ACTION_BAR_GAP,
          flexDirection: "column",
        }}
        className="ui-action-bar mt-4"
      >
        <View style={{ height: STATUS_ROW_HEIGHT }} className="ui-center justify-center">
          <Text variant="label" allowFontScaling={false}>{statusLabel}</Text>
        </View>
        <View style={{ gap: ACTION_BAR_GAP }}>
          <View className="ui-row ui-center" style={{ gap: 12, minHeight: BUTTONS_ROW_HEIGHT }}>
            <Button
              variant="danger"
              title={TABLE.fold}
              onPress={handleFold}
              className="flex-1 min-w-0"
              disabled={!FOLD}
            />
            <Button
              variant="ghost"
              title={checkCallLabel}
              onPress={handleCheckCall}
              className="flex-1 min-w-0"
              disabled={!CHECK && !CALL}
            />
            <Button
              variant="primary"
              title={betRaiseLabel}
              onPress={handleBetRaise}
              className="flex-1 min-w-0"
              disabled={betRaiseDisabled}
            />
          </View>
          <View className="ui-row justify-between" style={{ gap: 8, minHeight: CHIPS_ROW_HEIGHT }}>
            <ChipButton title={TABLE.min} onPress={handleMin} disabled={!WAGER} />
            <ChipButton title={TABLE.halfPot} onPress={handleHalfPot} disabled={!WAGER} />
            <ChipButton title={TABLE.pot} onPress={handlePot} disabled={!WAGER} />
            <ChipButton title={TABLE.max} onPress={handleMax} disabled={!WAGER} />
            <ChipButton title={TABLE.allIn} onPress={handleAllIn} disabled={!ALL_IN} />
            {canShowBetInput ? (
              <Input
                iconLeft="$"
                value={betState.display}
                onChangeText={handleBetInputChange}
                onBlur={normalizeBetInput}
                onSubmitEditing={normalizeBetInput}
                keyboardType="decimal-pad"
                returnKeyType="done"
                placeholder={wager ? formatInputFromCents(wager.bounds.min) : "0.00"}
                selectTextOnFocus
                editable={WAGER}
                allowFontScaling={false}
                maxLength={10}
                aria-label="Bet amount input"
                aria-disabled={!WAGER}
              />
            ) : (
              <View collapsable={false} style={{ height: BET_INPUT_ROW_HEIGHT, width: "100%" }} />
            )}
          </View>
        </View>
      </View>
      {showReconnectingOverlay && (
        <View pointerEvents="auto" className="absolute inset-0 bg-black/50 ui-center ui-stack-2 rounded-lg">
          <Text numberOfLines={1} ellipsizeMode="tail" variant="body" className="text-white text-center" allowFontScaling={false}>{TABLE.reconnecting}</Text>
        </View>
      )}
    </View>
  );
}
