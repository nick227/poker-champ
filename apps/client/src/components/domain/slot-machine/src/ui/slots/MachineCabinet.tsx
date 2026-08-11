import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { casino } from "../../theme/casinoCabinet";
import { MarqueeLights } from "./MarqueeLights";

type Props = {
  spinning: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Gold outer bezel + crimson housing with continuous marquee. */
export function MachineCabinet({ spinning, children, style }: Props) {
  return (
    <View style={[styles.goldBezel, style]}>
      <View style={styles.goldInset}>
        <MarqueeLights active={spinning} style={styles.marquee}>
          <View style={styles.crimson}>
            <View style={styles.inner}>{children}</View>
          </View>
        </MarqueeLights>
      </View>
    </View>
  );
}

const styles = {
  goldBezel: {
    width: "100%" as const,
    borderRadius: 22,
    padding: 5,
    backgroundColor: casino.goldMid,
    borderWidth: 2,
    borderColor: casino.goldHi,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    elevation: 14,
  },
  goldInset: {
    borderRadius: 18,
    padding: 3,
    backgroundColor: casino.goldLo,
    borderWidth: 1,
    borderColor: casino.gold,
  },
  marquee: {
    backgroundColor: casino.goldMid,
    borderRadius: 16,
  },
  crimson: {
    borderRadius: 12,
    overflow: "hidden" as const,
    backgroundColor: casino.crimson,
    borderWidth: 2,
    borderColor: casino.crimsonLo,
    position: "relative" as const,
  },
  inner: {
    padding: 12,
    gap: 10,
  },
};
