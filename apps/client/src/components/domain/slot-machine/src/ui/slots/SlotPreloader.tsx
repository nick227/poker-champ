import React, { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { casino } from "../../theme/casinoCabinet";

export const SLOT_FADE_IN_MS = 480;

type Props = {
  ready: boolean;
  reducedMotion: boolean;
  fadeInMs?: number;
  children: React.ReactNode;
};

/**
 * Holds a solid cabinet-colored veil until assets + layout are ready,
 * then crossfades the machine in over `fadeInMs`.
 */
export function SlotPreloader({
  ready,
  reducedMotion,
  fadeInMs = SLOT_FADE_IN_MS,
  children,
}: Props) {
  const veil = useSharedValue(1);
  const stage = useSharedValue(0);
  const duration = reducedMotion ? 0 : fadeInMs;

  useEffect(() => {
    if (!ready) {
      veil.value = 1;
      stage.value = 0;
      return;
    }
    veil.value = withTiming(0, { duration, easing: Easing.out(Easing.cubic) });
    stage.value = withTiming(1, { duration, easing: Easing.out(Easing.cubic) });
  }, [ready, duration, veil, stage]);

  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));
  const stageStyle = useAnimatedStyle(() => ({ opacity: stage.value }));

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.fill, stageStyle]}>{children}</Animated.View>
      <Animated.View
        pointerEvents={ready ? "none" : "auto"}
        style={[styles.veil, veilStyle]}
        accessibilityElementsHidden={ready}
        importantForAccessibility={ready ? "no-hide-descendants" : "yes"}
      >
        <Text style={styles.mark}>777</Text>
        <Text style={styles.caption}>LOADING</Text>
      </Animated.View>
    </View>
  );
}

const styles = {
  root: {
    flex: 1,
    width: "100%" as const,
    minHeight: 0,
    position: "relative" as const,
  },
  fill: {
    flex: 1,
    width: "100%" as const,
    minHeight: 0,
  },
  veil: {
    ...({
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    } as const),
    zIndex: 40,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: casino.crimsonLo,
    borderWidth: 3,
    borderColor: casino.goldMid,
    gap: 6,
  },
  mark: {
    color: casino.goldHi,
    fontSize: 42,
    fontWeight: "900" as const,
    letterSpacing: 6,
  },
  caption: {
    color: casino.gold,
    fontSize: 12,
    fontWeight: "700" as const,
    letterSpacing: 4,
  },
};
