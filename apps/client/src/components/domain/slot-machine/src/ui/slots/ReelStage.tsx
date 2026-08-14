import React from "react";
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { casino } from "../../theme/casinoCabinet";
import { paylineRange } from "../../engine/display";

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onReelLayout?: (height: number) => void;
  lit?: readonly [boolean, boolean, boolean];
  symbolHeight?: number;
  litStyle?: StyleProp<ViewStyle>;
};

/** Three-reel window. Wins draw one connected payline, not per-cell boxes. */
export function ReelStage({ children, style, onReelLayout, lit, symbolHeight = 0, litStyle }: Props) {
  const cols = React.Children.toArray(children);
  const span = lit ? paylineRange(lit) : null;

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
      {span && symbolHeight > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.payline,
            {
              top: symbolHeight,
              height: symbolHeight,
              left: `${(span.start / 3) * 100}%`,
              width: `${(span.count / 3) * 100}%`,
            },
            litStyle,
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = {
  shell: {
    flex: 1,
    width: "100%" as const,
    minHeight: 0,
    overflow: "hidden" as const,
    backgroundColor: casino.reelFace,
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
    width: 2,
    backgroundColor: casino.goldLo,
    opacity: 0.7,
  },
  payline: {
    position: "absolute" as const,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: casino.goldHi,
    backgroundColor: "rgba(255,224,138,0.12)",
    shadowColor: casino.goldHi,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
  },
};
