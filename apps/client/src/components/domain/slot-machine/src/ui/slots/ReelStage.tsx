import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { casino } from "../../theme/casinoCabinet";

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Three-reel stage with crimson dividers. */
export function ReelStage({ children, style }: Props) {
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
    height: 456,
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
};
