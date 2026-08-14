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
    <Animated.View style={[styles.wrap, animatedStyle]}>
      <AnimatedText numberOfLines={1} style={[styles.amount, readout.isJackpot && styles.jackpot]}>
        {failed ? readout.headline : formatCents(readout.winCents)}
      </AnimatedText>
      {win ? (
        <Text numberOfLines={1} style={styles.caption}>
          {readout.headline}
        </Text>
      ) : null}
    </Animated.View>
  );
}

const styles = {
  wrap: {
    alignItems: "center" as const,
    paddingBottom: 6,
  },
  amount: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: casino.goldHi,
    fontVariant: ["tabular-nums" as const],
  },
  jackpot: {
    color: casino.cream,
    fontSize: 20,
  },
  caption: {
    marginTop: 1,
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: "700" as const,
    color: casino.gold,
    textTransform: "uppercase" as const,
  },
};
