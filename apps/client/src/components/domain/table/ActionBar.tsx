import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { ChipButton } from "@/components/base/ChipButton";
import { Slider } from "@/components/base/Slider";
import { FadeTransition } from "@/components/base/FadeTransition";
import { DURATION } from "@/theme/animation";
import { formatCents } from "@/lib/format";
import type { HeroActionOptions } from "@poker-champ/realtime-contract";
import type { HeroStatus } from "./table.adapter";

const HERO_STATUS_LABEL: Record<HeroStatus, string> = {
  ACTIVE: "Waiting for your turn",
  FOLDED: "You folded this hand",
  ALL_IN: "You are all-in",
  OUT: "Sitting out",
  ABANDONED: "Sitting out",
};

export type TableAction = "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN";

export type ActionBarOnAction = (payload: { type: TableAction; amount?: number }) => void;

export function ActionBar({
  isMyTurn,
  heroStatus,
  actionOptions,
  potCents = 0,
  onAction,
}: {
  isMyTurn: boolean;
  heroStatus: HeroStatus;
  actionOptions?: HeroActionOptions;
  potCents?: number;
  onAction: ActionBarOnAction;
}) {
  const [betValue, setBetValue] = useState(0);

  const statusLabel = isMyTurn ? "Your turn" : HERO_STATUS_LABEL[heroStatus];
  const showActions = isMyTurn && !!actionOptions;

  const foldLabel = "Fold";
  const checkCallLabel = actionOptions?.canCheck
    ? "Check"
    : actionOptions?.canCall
      ? `Call ${formatCents(actionOptions.callAmount ?? 0)}`
      : "Check/Call";
  const betRaiseLabel = actionOptions?.canRaise ? "Raise" : actionOptions?.canBet ? "Bet" : "Bet/Raise";

  const foldDisabled = !actionOptions?.canFold;
  const checkCallDisabled = !(actionOptions?.canCheck || actionOptions?.canCall);
  const betRaiseDisabled = !(actionOptions?.canBet || actionOptions?.canRaise);

  const betMin = actionOptions?.minRaiseTo;
  const betMax = actionOptions?.maxRaiseTo;
  const canShowSlider =
    showActions &&
    typeof betMin === "number" &&
    typeof betMax === "number" &&
    (actionOptions?.canBet || actionOptions?.canRaise);

  useEffect(() => {
    if (betMin == null || betMax == null || betMax < betMin) return;
    setBetValue((v) => Math.max(betMin, Math.min(v || betMin, betMax)));
  }, [betMin, betMax]);

  const handleCheckCall = useCallback(() => {
    if (actionOptions?.canCheck) onAction({ type: "CHECK" });
    else if (actionOptions?.canCall) onAction({ type: "CALL" });
  }, [actionOptions, onAction]);

  const handleBetRaise = useCallback(() => {
    if (actionOptions?.canRaise) onAction({ type: "RAISE", amount: betValue });
    else if (actionOptions?.canBet) onAction({ type: "BET", amount: betValue });
  }, [actionOptions, betValue, onAction]);

  const handleMin = useCallback(() => {
    if (betMin != null) {
      if (actionOptions?.canRaise) onAction({ type: "RAISE", amount: betMin });
      else if (actionOptions?.canBet) onAction({ type: "BET", amount: betMin });
    }
  }, [actionOptions, betMin, onAction]);

  const handleHalfPot = useCallback(() => {
    const amount = Math.max(0, Math.floor(potCents / 2 / 100) * 100);
    if (actionOptions?.canRaise) onAction({ type: "RAISE", amount });
    else if (actionOptions?.canBet) onAction({ type: "BET", amount });
  }, [actionOptions, onAction, potCents]);

  const handlePot = useCallback(() => {
    const amount = Math.max(0, Math.floor(potCents / 100) * 100);
    if (actionOptions?.canRaise) onAction({ type: "RAISE", amount });
    else if (actionOptions?.canBet) onAction({ type: "BET", amount });
  }, [actionOptions, onAction, potCents]);

  const handleMax = useCallback(() => {
    if (actionOptions?.canAllIn) onAction({ type: "ALL_IN" });
    else if (betMax != null) {
      if (actionOptions?.canRaise) onAction({ type: "RAISE", amount: betMax });
      else if (actionOptions?.canBet) onAction({ type: "BET", amount: betMax });
    }
  }, [actionOptions, betMax, onAction]);

  return (
    <View className="ui-bottom-bar border-t border-border-subtle ui-p-4 ui-stack-3">
      <View className="ui-center py-1">
        <Text variant="label">{statusLabel}</Text>
      </View>
      <FadeTransition visible={showActions} duration={DURATION.fast}>
        <View className="ui-stack-3">
          <View className="ui-row ui-center" style={{ gap: 12 }}>
            <Button
              variant="danger"
              title={foldLabel}
              onPress={() => onAction({ type: "FOLD" })}
              className="flex-1 min-w-0"
              disabled={foldDisabled}
            />
            <Button
              variant="ghost"
              title={checkCallLabel}
              onPress={handleCheckCall}
              className="flex-1 min-w-0"
              disabled={checkCallDisabled}
            />
            <Button
              variant="primary"
              title={betRaiseLabel}
              onPress={handleBetRaise}
              className="flex-1 min-w-0"
              disabled={betRaiseDisabled}
            />
          </View>
          {canShowSlider && betMin != null && betMax != null ? (
            <View className="py-1">
              <Slider
                value={betValue}
                min={betMin}
                max={betMax}
                onValueChange={setBetValue}
                step={100}
              />
            </View>
          ) : null}
          <View className="ui-row justify-center" style={{ gap: 8 }}>
            <ChipButton title="MIN" onPress={handleMin} />
            <ChipButton title="½" onPress={handleHalfPot} />
            <ChipButton title="POT" onPress={handlePot} />
            <ChipButton title="MAX" onPress={handleMax} />
          </View>
        </View>
      </FadeTransition>
    </View>
  );
}
