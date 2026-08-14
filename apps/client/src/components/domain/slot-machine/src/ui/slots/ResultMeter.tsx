import React from "react";
import { Text, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { casino } from "../../theme/casinoCabinet";
import { formatCents } from "../../engine/format";
import type { MachineReadout } from "../../engine/display";

const AnimatedText = Animated.createAnimatedComponent(Text);

function copy(readout: MachineReadout): { line: string; win: boolean } {
  if (readout.phase === "win" && readout.winCents > 0) {
    return { line: `${formatCents(readout.winCents)}  ·  ${readout.headline}`, win: true };
  }
  if (readout.phase === "failed") return { line: readout.headline, win: false };
  if (readout.phase === "miss") return { line: readout.headline, win: false };
  if (readout.phase === "spinning") return { line: "", win: false };
  return { line: "", win: false };
}

export function ResultMeter({
  readout,
  animatedStyle,
}: {
  readout: MachineReadout;
  animatedStyle?: StyleProp<ViewStyle>;
}) {
  const shown = copy(readout);

  return (
    <Animated.View style={[styles.wrap, animatedStyle]}>
      <AnimatedText
        numberOfLines={1}
        style={[styles.line, shown.win && styles.lineWin, readout.isJackpot && styles.lineJackpot]}
      >
        {shown.line}
      </AnimatedText>
    </Animated.View>
  );
}

const styles = {
  wrap: {
    width: "100%" as const,
    height: 28,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    paddingHorizontal: 8,
  },
  line: {
    fontSize: 13,
    fontWeight: "700" as const,
    letterSpacing: 0.6,
    color: "#9a9a9a",
    textTransform: "uppercase" as const,
  },
  lineWin: {
    color: casino.goldHi,
  },
  lineJackpot: {
    color: "#fff4c2",
  },
};
