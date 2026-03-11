import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { EASING_OPACITY_IN_SOFT, EASING_OPACITY_OUT } from "../animationEasing";

const FALLBACK_STREAK_COLOR = "rgba(255, 180, 80, 0.35)";
const STREAK_COUNT_DEFAULT = 4;
const STREAK_ANGLE_DEFAULT_DEG = 45;
const STREAK_LINE_HEIGHT = 2;
const STREAK_LENGTH = 180;
const RISE_FRACTION = 0.2;
const FALL_FRACTION = 0.5;

type Props = {
  durationMs: number;
  delayMs?: number;
  color?: string;
  streakCount?: number;
  streakAngleDeg?: number;
};

export function AnimationLayerStreak({
  durationMs,
  delayMs = 0,
  color,
  streakCount = STREAK_COUNT_DEFAULT,
  streakAngleDeg = STREAK_ANGLE_DEFAULT_DEG,
}: Props) {
  const streaks = useRef(
    Array.from({ length: streakCount }, () => ({
      opacity: new Animated.Value(0),
      offset: Math.random() * 40 - 20,
    }))
  ).current;

  useEffect(() => {
    const riseMs = durationMs * RISE_FRACTION;
    const fallMs = durationMs * FALL_FRACTION;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      streaks.forEach((s, i) => {
        const stagger = i * 30;
        const start = () =>
          Animated.sequence([
            Animated.timing(s.opacity, {
              toValue: 1,
              duration: riseMs,
              useNativeDriver: true,
              easing: EASING_OPACITY_IN_SOFT,
            }),
            Animated.timing(s.opacity, {
              toValue: 0,
              duration: fallMs,
              useNativeDriver: true,
              easing: EASING_OPACITY_OUT,
            }),
          ]).start();
        if (stagger > 0) timeouts.push(setTimeout(start, stagger));
        else start();
      });
    };
    if (delayMs > 0) timeouts.push(setTimeout(run, delayMs));
    else run();
    return () => timeouts.forEach((id) => clearTimeout(id));
  }, [durationMs, delayMs, streaks]);

  const lineColor = color ?? FALLBACK_STREAK_COLOR;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {streaks.map((s, i) => (
        <Animated.View
          key={i}
          style={[
            styles.line,
            {
              backgroundColor: lineColor,
              opacity: s.opacity,
              transform: [
                { translateX: s.offset },
                { rotate: `${streakAngleDeg}deg` },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    position: "absolute",
    left: "50%",
    top: "50%",
    marginLeft: -STREAK_LENGTH / 2,
    marginTop: -STREAK_LINE_HEIGHT / 2,
    width: STREAK_LENGTH,
    height: STREAK_LINE_HEIGHT,
  },
});
