import React from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { casino } from "../../theme/casinoCabinet";
import { formatCents } from "../../engine/format";
import type { MachineReadout } from "../../engine/display";

const AnimatedText = Animated.createAnimatedComponent(Text);

function centerCopy(readout: MachineReadout): { amount: string; caption: string; win: boolean } {
  if (readout.phase === "spinning") return { amount: "—", caption: readout.detail, win: false };
  if (readout.phase === "idle") return { amount: "—", caption: readout.headline, win: false };
  if (readout.phase === "failed") return { amount: "—", caption: readout.headline, win: false };
  if (readout.phase === "miss" || readout.winCents <= 0) {
    return { amount: "—", caption: readout.headline, win: false };
  }
  return { amount: formatCents(readout.winCents), caption: readout.headline, win: true };
}

export function ResultMeter({
  readout,
  betCents,
  animatedStyle,
}: {
  readout: MachineReadout;
  betCents: number;
  animatedStyle?: StyleProp<ViewStyle>;
}) {
  const center = centerCopy(readout);
  const jackpot = readout.isJackpot;

  return (
    <Animated.View style={[styles.row, animatedStyle]}>
      <View style={styles.cell}>
        <Text style={styles.label}>Payline</Text>
        <Text style={styles.value}>1</Text>
      </View>
      <View style={[styles.cell, styles.center, jackpot && styles.centerJackpot]}>
        <AnimatedText style={[styles.amount, center.win && styles.amountWin, jackpot && styles.amountJackpot]}>
          {center.amount}
        </AnimatedText>
        <Text numberOfLines={1} style={styles.caption}>
          {center.caption}
        </Text>
      </View>
      <View style={styles.cell}>
        <Text style={styles.label}>Bet</Text>
        <Text style={styles.value}>{formatCents(betCents)}</Text>
      </View>
    </Animated.View>
  );
}

const styles = {
  row: {
    width: "100%" as const,
    flexDirection: "row" as const,
    flexShrink: 0,
    gap: 4,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    backgroundColor: casino.ink,
    borderWidth: 1,
    borderColor: casino.goldLo,
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  center: {
    flex: 1.7,
    borderColor: casino.goldMid,
  },
  centerJackpot: {
    borderColor: casino.goldHi,
    backgroundColor: "#140f05",
  },
  label: {
    fontSize: 9,
    letterSpacing: 2,
    fontWeight: "700" as const,
    color: "#8a8a8a",
    textTransform: "uppercase" as const,
  },
  value: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: "800" as const,
    color: "#f2f2f2",
    fontVariant: ["tabular-nums" as const],
  },
  amount: {
    fontSize: 22,
    fontWeight: "800" as const,
    color: "#d0d0d0",
    letterSpacing: 0.5,
    fontVariant: ["tabular-nums" as const],
  },
  amountWin: {
    color: casino.goldHi,
  },
  amountJackpot: {
    color: "#fff4c2",
    fontSize: 24,
  },
  caption: {
    marginTop: 2,
    fontSize: 10,
    letterSpacing: 0.6,
    fontWeight: "700" as const,
    color: "#b8b8b8",
    textTransform: "uppercase" as const,
  },
};
