import { useCallback, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { ChipButton } from "@/components/base/ChipButton";
import { Input } from "@/components/base/Input";
import { formatCents } from "@/lib/format";
import type { HeroActionOptions } from "@poker-champ/realtime-contract";
import type { HeroStatus } from "./table.adapter";
import { buildWagerActionPayload, getActionBarAvailability, resolvePrimaryWagerAction } from "./actionBar.logic";
import {
  ACTION_BAR_HEIGHT,
  ACTION_BAR_PADDING,
  ACTION_BAR_GAP,
  STATUS_ROW_HEIGHT,
  BUTTONS_ROW_HEIGHT,
  BET_INPUT_ROW_HEIGHT,
  CHIPS_ROW_HEIGHT,
} from "./constants/actionBar.constants";

export { ACTION_BAR_HEIGHT };

const HERO_STATUS_LABEL: Record<HeroStatus, string> = {
  ACTIVE: "Waiting for your turn",
  FOLDED: "You folded this hand",
  ALL_IN: "You are all-in",
  OUT: "Sitting out",
  ABANDONED: "Sitting out",
};

export type TableAction = "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN";

export type ActionBarOnAction = (payload: { type: TableAction; amount?: number }) => void;

function formatInputFromCents(cents: number): string {
  return (Math.max(0, cents) / 100).toFixed(2);
}

function parseInputToCents(input: string): number {
  if (!input.trim()) return 0;
  const numeric = Number.parseFloat(input.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric * 100);
}

export function ActionBar({
  isMyTurn,
  heroStatus,
  actionOptions,
  potCents = 0,
  connectionStatus,
  onAction,
}: {
  isMyTurn: boolean;
  heroStatus: HeroStatus;
  actionOptions?: HeroActionOptions;
  potCents?: number;
  connectionStatus?: "CONNECTED" | "RECONNECTING" | "DISCONNECTED";
  onAction: ActionBarOnAction;
}) {
  const [betInput, setBetInput] = useState("0.00");

  const statusLabel = isMyTurn ? "Your turn" : HERO_STATUS_LABEL[heroStatus];
  const { showActions, actionsEnabled } = getActionBarAvailability({ isMyTurn, actionOptions, connectionStatus });

  const primaryWagerAction = resolvePrimaryWagerAction(actionOptions);
  const canWager = !!primaryWagerAction;

  const foldLabel = "Fold";
  const checkCallLabel = actionOptions?.canCheck
    ? "Check"
    : actionOptions?.canCall
      ? `Call ${formatCents(actionOptions.callAmount ?? 0)}`
      : "Check/Call";

  const foldDisabled = !actionOptions?.canFold;
  const checkCallDisabled = !(actionOptions?.canCheck || actionOptions?.canCall);

  const betMin = actionOptions?.minRaiseTo;
  const betMax = actionOptions?.maxRaiseTo;
  const canShowBetInput =
    showActions &&
    typeof betMin === "number" &&
    typeof betMax === "number" &&
    canWager;

  const submitWager = useCallback(
    (rawAmount: number) => {
      if (!actionOptions) return;
      const min = actionOptions.minRaiseTo;
      const max = actionOptions.maxRaiseTo;
      if (typeof min !== "number" || typeof max !== "number" || max <= 0) return;

      // Clamp to server-authoritative bounds to avoid INVALID_ACTION / INSUFFICIENT_STACK noise.
      const clamped = Math.max(min, Math.min(rawAmount, max));
      const payload = buildWagerActionPayload(actionOptions, clamped);
      if (payload) onAction(payload);
    },
    [actionOptions, onAction],
  );

  const clampToBounds = useCallback(
    (rawAmount: number): number => {
      if (betMin == null || betMax == null || betMax < betMin) return Math.max(0, rawAmount);
      return Math.max(betMin, Math.min(rawAmount, betMax));
    },
    [betMax, betMin],
  );

  const parsedBetCents = parseInputToCents(betInput);
  const clampedBetCents = clampToBounds(parsedBetCents);

  const normalizeBetInput = useCallback(() => {
    const clamped = clampedBetCents;
    setBetInput(formatInputFromCents(clamped));
    return clamped;
  }, [clampedBetCents]);

  const handleBetInputChange = useCallback((text: string) => {
    const sanitized = text.replace(/[^0-9.]/g, "");
    setBetInput(sanitized);
  }, []);

  const handleCheckCall = useCallback(() => {
    if (actionOptions?.canCheck) onAction({ type: "CHECK" });
    else if (actionOptions?.canCall) onAction({ type: "CALL" });
  }, [actionOptions, onAction]);

  const handleBetRaise = useCallback(() => {
    const amount = normalizeBetInput();
    submitWager(amount);
  }, [normalizeBetInput, submitWager]);

  const handleMin = useCallback(() => {
    if (betMin != null) {
      setBetInput(formatInputFromCents(betMin));
    }
  }, [betMin]);

  const handleHalfPot = useCallback(() => {
    const amount = Math.max(0, Math.floor(potCents / 2 / 100) * 100);
    const next = clampToBounds(amount);
    setBetInput(formatInputFromCents(next));
  }, [clampToBounds, potCents]);

  const handlePot = useCallback(() => {
    const amount = Math.max(0, Math.floor(potCents / 100) * 100);
    const next = clampToBounds(amount);
    setBetInput(formatInputFromCents(next));
  }, [clampToBounds, potCents]);

  const handleMax = useCallback(() => {
    if (betMax != null) {
      setBetInput(formatInputFromCents(betMax));
    }
  }, [betMax]);

  const handleAllIn = useCallback(() => {
    if (actionOptions?.canAllIn) {
      onAction({ type: "ALL_IN" });
    }
  }, [actionOptions, onAction]);

  const enteredBelowMin = betMin != null && clampedBetCents < betMin;
  const betRaiseDisabled = !canWager || enteredBelowMin;
  const hasBetBounds = betMin != null && betMax != null;
  const selectedWagerCents = hasBetBounds
    ? (clampedBetCents > 0 ? clampedBetCents : betMin)
    : Math.max(0, clampedBetCents);
  const betRaiseVerb = primaryWagerAction === "RAISE" ? "Raise" : primaryWagerAction === "BET" ? "Bet" : "Bet/Raise";
  const betRaiseLabel = `${betRaiseVerb}: ${formatCents(selectedWagerCents)}`;

  return (
    <View
      collapsable={false}
      className="relative"
      style={{ height: ACTION_BAR_HEIGHT, paddingHorizontal: 12 }}
    >
      <View
        style={{
          opacity: showActions ? 1 : 0.5,
          pointerEvents: showActions ? "auto" : "none",
          padding: ACTION_BAR_PADDING,
          gap: ACTION_BAR_GAP,
          flexDirection: "column",
        }}
        className="ui-bottom-bar"
      >
        <View style={{ height: STATUS_ROW_HEIGHT }} className="ui-center justify-center">
          <Text variant="label" allowFontScaling={false}>{statusLabel}</Text>
        </View>
        <View style={{ gap: ACTION_BAR_GAP }}>
          <View className="ui-row ui-center" style={{ gap: 12, minHeight: BUTTONS_ROW_HEIGHT }}>
            <Button
              variant="danger"
              title={foldLabel}
              onPress={() => onAction({ type: "FOLD" })}
              className="flex-1 min-w-0"
              disabled={!actionsEnabled || foldDisabled}
            />
            <Button
              variant="ghost"
              title={checkCallLabel}
              onPress={handleCheckCall}
              className="flex-1 min-w-0"
              disabled={!actionsEnabled || checkCallDisabled}
            />
            <Button
              variant="primary"
              title={betRaiseLabel}
              onPress={handleBetRaise}
              className="flex-1 min-w-0"
              disabled={!actionsEnabled || betRaiseDisabled}
            />
          </View>
          <View style={{ height: BET_INPUT_ROW_HEIGHT, justifyContent: "center" }}>
            {canShowBetInput && betMin != null && betMax != null ? (
              <Input
                iconLeft="$"
                value={betInput}
                onChangeText={handleBetInputChange}
                onBlur={normalizeBetInput}
                onSubmitEditing={normalizeBetInput}
                keyboardType="decimal-pad"
                returnKeyType="done"
                placeholder={formatInputFromCents(betMin)}
                selectTextOnFocus
                editable={actionsEnabled}
                allowFontScaling={false}
              />
            ) : (
              <View collapsable={false} style={{ height: BET_INPUT_ROW_HEIGHT, width: "100%" }} />
            )}
          </View>
          <View className="ui-row justify-center" style={{ gap: 8, minHeight: CHIPS_ROW_HEIGHT }}>
            <ChipButton title="MIN" onPress={handleMin} disabled={!actionsEnabled} />
            <ChipButton title="1/2" onPress={handleHalfPot} disabled={!actionsEnabled} />
            <ChipButton title="POT" onPress={handlePot} disabled={!actionsEnabled} />
            <ChipButton title="ALL IN" onPress={handleAllIn} disabled={!actionsEnabled || !actionOptions?.canAllIn} />
          </View>
        </View>
      </View>
      {connectionStatus === "RECONNECTING" && (
        <View pointerEvents="auto" className="absolute inset-0 bg-black/50 ui-center ui-stack-2 rounded-lg">
          <Text variant="body" className="text-white text-center" allowFontScaling={false}>Reconnecting...</Text>
        </View>
      )}
    </View>
  );
}
