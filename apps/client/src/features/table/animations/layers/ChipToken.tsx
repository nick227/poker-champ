/**
 * Single poker-chip disc: a small two-tone token used by ChipTravelOverlay to render
 * traveling chip stacks. Purely presentational — no animation, no game logic.
 */
import { View, StyleSheet } from "react-native";

const CHIP_SIZE = 18;
const CHIP_RIM_WIDTH = 3;

export type ChipTokenProps = {
  /** Rim/edge color (theme-driven: gold for payouts, neutral for bets). */
  color?: string;
  size?: number;
};

const FALLBACK_CHIP_COLOR = "rgba(255, 200, 90, 0.95)";

export function ChipToken({ color, size = CHIP_SIZE }: ChipTokenProps) {
  const rimColor = color ?? FALLBACK_CHIP_COLOR;
  return (
    <View
      style={[
        styles.rim,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: rimColor,
        },
      ]}
    >
      <View style={[styles.core, { borderRadius: (size - CHIP_RIM_WIDTH * 2) / 2 }]} />
      <View style={[styles.highlight, { backgroundColor: rimColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  rim: {
    borderWidth: CHIP_RIM_WIDTH,
    backgroundColor: "rgba(20, 16, 12, 0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  core: {
    flex: 1,
    alignSelf: "stretch",
    margin: 2,
    backgroundColor: "rgba(40, 32, 24, 0.9)",
  },
  highlight: {
    position: "absolute",
    top: 2,
    left: 4,
    width: 4,
    height: 2,
    borderRadius: 1,
    opacity: 0.8,
  },
});
