import React from "react";
import { Pressable, Text, View } from "react-native";
import { casino } from "../../theme/casinoCabinet";
import { formatCents } from "../../engine/format";
import type { BetTier } from "../../hooks/useBetTier";

const ORDER: BetTier[] = ["HALF", "FULL", "DOUBLE"];

function nextTier(tier: BetTier, dir: -1 | 1): BetTier {
  const i = ORDER.indexOf(tier);
  return ORDER[Math.max(0, Math.min(ORDER.length - 1, i + dir))];
}

export function BetStepper({
  tier,
  betCents,
  disabled,
  onTier,
}: {
  tier: BetTier;
  betCents: number;
  disabled?: boolean;
  onTier: (tier: BetTier) => void;
}) {
  return (
    <View style={styles.stepper}>
      <Step label="−" disabled={disabled || tier === "HALF"} onPress={() => onTier(nextTier(tier, -1))} />
      <View style={styles.betFace}>
        <Text style={styles.betValue}>{formatCents(betCents)}</Text>
      </View>
      <Step label="+" disabled={disabled || tier === "DOUBLE"} onPress={() => onTier(nextTier(tier, 1))} />
    </View>
  );
}

export function MaxBetButton({ disabled, onPress }: { disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.max, disabled && styles.dim, pressed && !disabled && styles.pressed]}
    >
      <Text style={styles.maxText}>Max</Text>
    </Pressable>
  );
}

function Step({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.step, disabled && styles.dim, pressed && !disabled && styles.pressed]}
    >
      <Text style={styles.stepText}>{label}</Text>
    </Pressable>
  );
}

const styles = {
  stepper: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    height: 40,
    gap: 4,
  },
  step: {
    width: 36,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: casino.goldMid,
    backgroundColor: casino.bg,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  stepText: {
    fontSize: 20,
    fontWeight: "800" as const,
    color: casino.goldHi,
  },
  betFace: {
    minWidth: 64,
    height: 40,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: casino.goldLo,
    backgroundColor: casino.ink,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  betValue: {
    fontSize: 14,
    fontWeight: "800" as const,
    color: "#f2f2f2",
    fontVariant: ["tabular-nums" as const],
  },
  max: {
    height: 40,
    minWidth: 72,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: casino.goldLo,
    backgroundColor: casino.bg,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  maxText: {
    fontSize: 12,
    letterSpacing: 1.6,
    fontWeight: "800" as const,
    color: casino.gold,
    textTransform: "uppercase" as const,
  },
  dim: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.8,
  },
};
