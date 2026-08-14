import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { casino } from "../../theme/casinoCabinet";
import { MarqueeLights } from "./MarqueeLights";

export type CabinetMood = "idle" | "spinning" | "near-win" | "win" | "jackpot" | "disabled";

type Props = {
  mood: CabinetMood;
  reducedMotion?: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

const GLOW: Record<CabinetMood, string> = {
  idle: "rgba(230,180,34,0.18)",
  spinning: "rgba(255,224,138,0.42)",
  "near-win": "rgba(255,224,138,0.7)",
  win: "rgba(255,224,138,0.62)",
  jackpot: "rgba(255,196,80,0.85)",
  disabled: "rgba(0,0,0,0.0)",
};

/** One gold housing, one black face. Marquee is the only extra ring. */
export function MachineCabinet({ mood, reducedMotion, children, style }: Props) {
  const chasing = mood === "spinning" || mood === "near-win" || mood === "jackpot";
  return (
    <View style={[styles.pit, style]}>
      <View style={[styles.glow, { shadowColor: GLOW[mood] }]}>
        <View style={[styles.outer, mood === "disabled" && styles.disabled]}>
          <MarqueeLights active={chasing} reducedMotion={reducedMotion} style={styles.marquee}>
            <View style={styles.face}>{children}</View>
          </MarqueeLights>
        </View>
      </View>
    </View>
  );
}

const styles = {
  pit: {
    flex: 1,
    width: "100%" as const,
    minHeight: 0,
    backgroundColor: casino.reelFace,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  glow: {
    flex: 1,
    minHeight: 0,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 28,
  },
  outer: {
    flex: 1,
    minHeight: 0,
    borderWidth: 2,
    borderColor: casino.goldHi,
    backgroundColor: casino.goldLo,
  },
  disabled: {
    opacity: 0.72,
  },
  marquee: {
    flex: 1,
    minHeight: 0,
    backgroundColor: casino.goldLo,
  },
  face: {
    flex: 1,
    minHeight: 0,
    backgroundColor: casino.reelFace,
    gap: 0,
  },
};
