import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { casino } from "../../theme/casinoCabinet";
import { MarqueeLights } from "./MarqueeLights";

type Props = {
  spinning: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Full-bleed video-slot screen bezel — thin gold frame, not a floating card. */
export function MachineCabinet({ spinning, children, style }: Props) {
  return (
    <View style={[styles.bezel, style]}>
      <MarqueeLights active={spinning} style={styles.marquee}>
        <View style={styles.screen}>{children}</View>
      </MarqueeLights>
    </View>
  );
}

const styles = {
  bezel: {
    flex: 1,
    width: "100%" as const,
    minHeight: 0,
    borderWidth: 3,
    borderColor: casino.goldHi,
    backgroundColor: casino.goldLo,
  },
  marquee: {
    flex: 1,
    minHeight: 0,
    backgroundColor: casino.goldMid,
  },
  screen: {
    flex: 1,
    minHeight: 0,
    backgroundColor: casino.crimson,
    borderWidth: 2,
    borderColor: casino.crimsonLo,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 8,
  },
};
