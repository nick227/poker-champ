import React from "react";
import { Text, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { casino } from "../../theme/casinoCabinet";
import { formatCents } from "../../engine/format";
import type { MachineReadout } from "../../engine/display";

const AnimatedText = Animated.createAnimatedComponent(Text);

export function ResultMeter({
  readout,
  animatedStyle,
}: {
  readout: MachineReadout;
  animatedStyle?: StyleProp<ViewStyle>;
}) {
  const win = readout.phase === "win" && readout.winCents > 0;
  const failed = readout.phase === "failed";
  if (!win && !failed) return null;

  return (
    <Animated.View style={[styles.wrap, readout.isJackpot && styles.jackpot, animatedStyle]} pointerEvents="none">
      <AnimatedText style={[styles.amount, readout.isJackpot && styles.amountJackpot]}>
        {failed ? readout.headline : formatCents(readout.winCents)}
      </AnimatedText>
      {win && readout.headline ? (
        <Text numberOfLines={1} style={styles.caption}>
          {readout.headline}
        </Text>
      ) : null}
    </Animated.View>
  );
}

const styles = {
  wrap: {
    position: "absolute" as const,
    left: 8,
    right: 8,
    bottom: 8,
    alignItems: "center" as const,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(13,13,13,0.82)",
    borderWidth: 1,
    borderColor: casino.goldMid,
  },
  jackpot: {
    borderColor: casino.goldHi,
    backgroundColor: "rgba(20,15,5,0.9)",
  },
  amount: {
    fontSize: 20,
    fontWeight: "800" as const,
    color: casino.goldHi,
    fontVariant: ["tabular-nums" as const],
  },
  amountJackpot: {
    color: "#fff4c2",
    fontSize: 22,
  },
  caption: {
    marginTop: 1,
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: "700" as const,
    color: "#d8d8d8",
    textTransform: "uppercase" as const,
  },
};
