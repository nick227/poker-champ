import React from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
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

/** Dimensional gold cabinet: double bezel, marquee ring, mood glow. */
export function MachineCabinet({ mood, reducedMotion, children, style }: Props) {
  const chasing = mood === "spinning" || mood === "near-win" || mood === "jackpot";
  return (
    <View style={[styles.pit, style]}>
      <View style={[styles.glow, { shadowColor: GLOW[mood] }]}>
        <View style={[styles.outer, mood === "disabled" && styles.disabled]}>
          <View style={styles.bevel}>
            <MarqueeLights active={chasing} reducedMotion={reducedMotion} style={styles.marquee}>
              <View style={styles.screen}>
                <View style={styles.sheen} pointerEvents="none" />
                {children}
              </View>
            </MarqueeLights>
          </View>
        </View>
      </View>
    </View>
  );
}

const trap = Platform.OS === "web" ? ({ clipPath: "polygon(3.2% 0%, 96.8% 0%, 100% 100%, 0% 100%)" } as ViewStyle) : {};

const styles = {
  pit: {
    flex: 1,
    width: "100%" as const,
    minHeight: 0,
    backgroundColor: casino.pit,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 4,
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
    ...trap,
  },
  disabled: {
    opacity: 0.72,
  },
  bevel: {
    flex: 1,
    minHeight: 0,
    margin: 4,
    borderWidth: 2,
    borderColor: casino.goldMid,
    backgroundColor: casino.bg,
  },
  marquee: {
    flex: 1,
    minHeight: 0,
    backgroundColor: casino.goldLo,
  },
  screen: {
    flex: 1,
    minHeight: 0,
    backgroundColor: casino.panel,
    borderWidth: 2,
    borderColor: casino.ink,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 6,
    gap: 6,
    position: "relative" as const,
  },
  sheen: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    height: 10,
    backgroundColor: "rgba(255,224,138,0.08)",
    zIndex: 4,
  },
};
