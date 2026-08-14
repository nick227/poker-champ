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

export function DeckActions({
  autoPlay,
  disabled,
  onMax,
  onToggleAuto,
}: {
  autoPlay?: boolean;
  disabled?: boolean;
  onMax: () => void;
  onToggleAuto: () => void;
}) {
  return (
    <View style={styles.actions}>
      <Ghost label="Max bet" disabled={disabled} onPress={onMax} />
      <Ghost label={autoPlay ? "Auto on" : "Auto play"} active={autoPlay} onPress={onToggleAuto} />
    </View>
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

function Ghost({
  label,
  active,
  disabled,
  onPress,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.ghost,
        active && styles.ghostOn,
        disabled && styles.dim,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.ghostText, active && styles.ghostTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = {
  stepper: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row" as const,
    alignItems: "stretch" as const,
    gap: 6,
  },
  actions: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  step: {
    width: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: casino.goldMid,
    backgroundColor: casino.bg,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  stepText: {
    fontSize: 26,
    fontWeight: "800" as const,
    color: casino.goldHi,
  },
  betFace: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: casino.goldLo,
    backgroundColor: casino.ink,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 6,
  },
  betValue: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: "#f2f2f2",
    fontVariant: ["tabular-nums" as const],
  },
  ghost: {
    flex: 1,
    borderWidth: 1,
    borderColor: casino.goldLo,
    backgroundColor: casino.bg,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 8,
  },
  ghostOn: {
    borderColor: casino.goldHi,
    backgroundColor: "#1a1408",
  },
  ghostText: {
    fontSize: 13,
    letterSpacing: 1.4,
    fontWeight: "800" as const,
    color: casino.gold,
    textTransform: "uppercase" as const,
  },
  ghostTextOn: {
    color: casino.goldHi,
  },
  dim: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.8,
  },
};
