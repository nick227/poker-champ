import React from "react";
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { casino } from "../../theme/casinoCabinet";

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onReelLayout?: (height: number) => void;
};

/** Flex-fill three-reel stage; reports height so symbol cells can size to the window. */
export function ReelStage({ children, style, onReelLayout }: Props) {
  const cols = React.Children.toArray(children);

  const handleLayout = (e: LayoutChangeEvent) => {
    onReelLayout?.(e.nativeEvent.layout.height);
  };

  return (
    <View style={[styles.shell, style]} onLayout={handleLayout}>
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
    flex: 1,
    width: "100%" as const,
    minHeight: 0,
    overflow: "hidden" as const,
    backgroundColor: casino.bg,
    borderWidth: 2,
    borderColor: casino.goldMid,
    position: "relative" as const,
  },
  reelsRow: {
    flex: 1,
    width: "100%" as const,
    minHeight: 0,
    flexDirection: "row" as const,
    alignItems: "stretch" as const,
  },
  col: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  divider: {
    width: 4,
    backgroundColor: casino.border,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: casino.goldLo,
  },
};
