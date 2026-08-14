import React from "react";
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { casino } from "../../theme/casinoCabinet";

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onReelLayout?: (height: number) => void;
  paylineLit?: boolean;
  paylineStyle?: StyleProp<ViewStyle>;
};

/** Three-reel window with a single center payline overlay. */
export function ReelStage({ children, style, onReelLayout, paylineLit, paylineStyle }: Props) {
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
      <View style={styles.paylineLayer} pointerEvents="none">
        <Animated.View style={[styles.payline, paylineLit && styles.paylineOn, paylineStyle]}>
          <View style={styles.diamond} />
          <View style={styles.line} />
          <View style={styles.diamond} />
        </Animated.View>
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
    backgroundColor: casino.reelFace,
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
    width: 2,
    backgroundColor: casino.goldLo,
    opacity: 0.7,
  },
  paylineLayer: {
    position: "absolute" as const,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center" as const,
    zIndex: 4,
  },
  payline: {
    height: 3,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    opacity: 0.55,
  },
  paylineOn: {
    opacity: 1,
    shadowColor: casino.payline,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: casino.payline,
  },
  diamond: {
    width: 8,
    height: 8,
    backgroundColor: casino.payline,
    transform: [{ rotate: "45deg" }],
    marginHorizontal: 4,
  },
};
