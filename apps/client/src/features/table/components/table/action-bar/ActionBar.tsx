import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { ChipButton } from "@/components/base/ChipButton";
import { Input } from "@/components/base/Input";
import { formatCents } from "@/lib/format";
import { TABLE } from "@/constants/copy";
import type { HeroActionOptions } from "@poker-champ/realtime-contract";
import type { HeroStatus } from "../table.adapter";
import { ActionContext, useWagerCalculations } from "./actionBar.logic";
import { CONTAINER, STATUS, BUTTONS } from "./layout";
import { ACTION_BAR_HEIGHT } from "../constants/table-layout.constants";
import { actionBarStyles } from "./styles";

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

  const { FOLD, CHECK, CALL, WAGER, ALL_IN } = allowedActions;

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
  const showWagerButton = WAGER;
  const showChipsRow = WAGER || ALL_IN;

  const submitWager = useCallback(
    (rawAmount: number) => {
      if (!wager) return;
      try {
        const resolvedAmount = wager.resolveAmount(rawAmount);
        const payload = wager.buildPayload(resolvedAmount);
        if (payload) onAction(payload);
      } catch (error) {
        console.error('Error submitting wager:', error);
      }
    },
    [wager, onAction],
  );

  const resolvedBetCents = wager ? wager.resolveAmount(betState.cents) : 0;

  const normalizeBetInput = useCallback(() => {
    if (!wager) return 0;
    try {
      const parsed = parseInputToCents(betState.display);
      const resolved = wager.resolveAmount(parsed);
      setBetState({ cents: resolved, display: formatInputFromCents(resolved) });
      return resolved;
    } catch (error) {
      console.error('Invalid bet input:', error);
      const minCents = wager.bounds.min;
      setBetState({ cents: minCents, display: formatInputFromCents(minCents) });
      return minCents;
    }
  }, [wager, betState.display]);

  const handleBetInputChange = useCallback((text: string) => {
    const numericText = text.replace(/[^0-9.]/g, '');
    const parts = numericText.split('.');
    if (parts.length > 2) return;
    setBetState(prev => ({ ...prev, display: numericText }));
  }, []);

  const handleFold = useCallback(() => {
    if (!FOLD) return;
    onAction({ type: "FOLD" });
  }, [FOLD, onAction]);

  const handleCheckCall = useCallback(() => {
    if (!CHECK && !CALL) return;
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
      style={[actionBarStyles.root, { height: ACTION_BAR_HEIGHT }]}
    >
      <View
        style={[
          actionBarStyles.inner,
          {
            opacity: showActions ? 1 : 0.5,
            pointerEvents: showActions ? "auto" : "none",
          },
        ]}
        className="ui-action-bar mt-2"
      >
        <View style={actionBarStyles.statusRow} className="ui-center justify-center bg-panel/90 rounded-lg px-3 py-1">
          <Text variant="label" allowFontScaling={false}>{statusLabel}</Text>
        </View>
        <View style={{ gap: CONTAINER.GAP }}>
          <View className="ui-row ui-center" style={actionBarStyles.buttonsRow}>
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
            {showWagerButton ? (
              <Button
                variant="primary"
                title={betRaiseLabel}
                onPress={handleBetRaise}
                className="flex-1 min-w-0"
                disabled={betRaiseDisabled}
              />
            ) : null}
          </View>
          {showChipsRow ? (
            <View className="ui-row justify-center" style={actionBarStyles.chipsRow}>
              {WAGER ? <ChipButton title={TABLE.min} onPress={handleMin} disabled={!WAGER} /> : null}
              {WAGER ? <ChipButton title={TABLE.halfPot} onPress={handleHalfPot} disabled={!WAGER} /> : null}
              {WAGER ? <ChipButton title={TABLE.pot} onPress={handlePot} disabled={!WAGER} /> : null}
              {ALL_IN ? <ChipButton title={TABLE.allIn} onPress={handleAllIn} disabled={!ALL_IN} /> : null}
            </View>
          ) : (
            <View collapsable={false} style={[actionBarStyles.chipsRow, { width: "100%" }]} />
          )}
          <View className="ui-row justify-center">
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
                style={{ maxWidth: 144 }}
                aria-label="Bet amount input"
                aria-disabled={!WAGER}
              />
            ) : (
              <View collapsable={false} style={actionBarStyles.betInputPlaceholder} />
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
