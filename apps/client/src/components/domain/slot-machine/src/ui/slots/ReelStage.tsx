import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { casino } from "../../theme/casinoCabinet";

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  paylineStyle?: StyleProp<ViewStyle>;
};

/** Three-reel stage with dividers, gold payline, and glass sheen. */
export function ReelStage({ children, style, paylineStyle }: Props) {
  const cols = React.Children.toArray(children);

  return (
    <View style={[styles.shell, style]}>
      <View style={styles.reelsRow}>
        {cols.map((child, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <View style={styles.divider} /> : null}
            <View style={styles.col}>{child}</View>
          </React.Fragment>
        ))}
      </View>
      <Animated.View style={[styles.payline, paylineStyle]} pointerEvents="none" />
      <View style={styles.glass} pointerEvents="none" />
    </View>
  );
}

const styles = {
  shell: {
    width: "100%" as const,
    borderRadius: 10,
    overflow: "hidden" as const,
    backgroundColor: casino.crimsonLo,
    borderWidth: 3,
    borderColor: casino.goldMid,
    position: "relative" as const,
  },
  reelsRow: {
    width: "100%" as const,
    height: 288,
    flexDirection: "row" as const,
    alignItems: "stretch" as const,
  },
  col: {
    flex: 1,
    minWidth: 0,
  },
  divider: {
    width: 4,
    backgroundColor: casino.crimsonHi,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: casino.goldLo,
  },
  payline: {
    position: "absolute" as const,
    left: 0,
    right: 0,
    top: "50%" as const,
    marginTop: -2,
    height: 4,
    backgroundColor: casino.payline,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: casino.goldLo,
    opacity: 0.9,
    zIndex: 3,
    shadowColor: casino.goldHi,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
  },
  glass: {
    position: "absolute" as const,
    top: 0,
    left: "8%" as const,
    right: "18%" as const,
    height: "28%" as const,
    backgroundColor: casino.glass,
    borderBottomRightRadius: 80,
    opacity: 0.45,
    zIndex: 4,
  },
};
