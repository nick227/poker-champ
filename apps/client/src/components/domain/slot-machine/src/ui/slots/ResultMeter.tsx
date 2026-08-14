import React from "react";
import { Text, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { casino } from "../../theme/casinoCabinet";
import { formatCents } from "../../engine/format";
import type { MachineReadout } from "../../engine/display";

const AnimatedText = Animated.createAnimatedComponent(Text);

function centerCopy(readout: MachineReadout): { amount: string; caption: string; win: boolean } {
  if (readout.phase === "idle") return { amount: "—", caption: "", win: false };
  if (readout.phase === "spinning") return { amount: "—", caption: "Spinning", win: false };
  if (readout.phase === "failed") return { amount: "—", caption: readout.headline, win: false };
  if (readout.phase === "miss" || readout.winCents <= 0) {
    return { amount: "—", caption: readout.headline, win: false };
  }
  return { amount: formatCents(readout.winCents), caption: readout.headline, win: true };
}

export function ResultMeter({
  readout,
  animatedStyle,
}: {
  readout: MachineReadout;
  animatedStyle?: StyleProp<ViewStyle>;
}) {
  const center = centerCopy(readout);
  const jackpot = readout.isJackpot;

  return (
    <Animated.View style={[styles.wrap, jackpot && styles.wrapJackpot, animatedStyle]}>
      <AnimatedText style={[styles.amount, center.win && styles.amountWin, jackpot && styles.amountJackpot]}>
        {center.amount}
      </AnimatedText>
      {center.caption ? (
        <Text numberOfLines={1} style={styles.caption}>
          {center.caption}
        </Text>
      ) : null}
    </Animated.View>
  );
}

const styles = {
  wrap: {
    width: "100%" as const,
    flexShrink: 0,
    minHeight: 56,
    backgroundColor: casino.ink,
    borderWidth: 1,
    borderColor: casino.goldMid,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  wrapJackpot: {
    borderColor: casino.goldHi,
    backgroundColor: "#140f05",
  },
  amount: {
    fontSize: 26,
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
    fontSize: 28,
  },
  caption: {
    marginTop: 2,
    fontSize: 12,
    letterSpacing: 1,
    fontWeight: "700" as const,
    color: "#b8b8b8",
    textTransform: "uppercase" as const,
  },
};
