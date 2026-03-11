import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { EASING_OPACITY_IN, EASING_OPACITY_OUT, EASING_SCALE } from "../animationEasing";

const FALLBACK_RAY_COLOR = "rgba(255, 100, 50, 0.5)";
const RAY_WIDTH = 3;
const RAY_SCALE_X = 75;
const DEFAULT_SCALE_RANGE: [number, number] = [0.3, 1.2];

type Props = {
  durationMs: number;
  delayMs?: number;
  rays?: number;
  color?: string;
  scaleRange?: [number, number];
};

export function AnimationLayerBurst({
  durationMs,
  delayMs = 0,
  rays = 8,
  color,
  scaleRange = DEFAULT_SCALE_RANGE,
}: Props) {
  const [scaleFrom, scaleTo] = scaleRange;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(scaleFrom)).current;
  const rayColor = color ?? FALLBACK_RAY_COLOR;

  useEffect(() => {
    const opacityInFraction = 0.18;
    const scaleInFraction = 0.38;
    const opacityOutFraction = 0.5;
    const start = () => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: durationMs * opacityInFraction,
          useNativeDriver: true,
          easing: EASING_OPACITY_IN,
        }),
        Animated.timing(scale, {
          toValue: scaleTo,
          duration: durationMs * scaleInFraction,
          useNativeDriver: true,
          easing: EASING_SCALE,
        }),
      ]).start(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: durationMs * opacityOutFraction,
          useNativeDriver: true,
          easing: EASING_OPACITY_OUT,
        }).start();
      });
    };
    const t = delayMs > 0 ? setTimeout(start, delayMs) : start();
    return () => (typeof t === "number" ? clearTimeout(t) : undefined);
  }, [durationMs, delayMs, opacity, scale, scaleFrom, scaleTo]);

  const step = (2 * Math.PI) / rays;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" collapsable={false}>
      <Animated.View
        style={[
          styles.center,
          {
            opacity,
            transform: [{ scale }],
          },
        ]}
      >
        {Array.from({ length: rays }, (_, i) => {
          const angle = i * step - Math.PI / 2;
          return (
            <View
              key={i}
              style={[
                styles.ray,
                { backgroundColor: rayColor },
                {
                  transform: [
                    { translateX: -RAY_WIDTH / 2 },
                    { rotate: `${angle}rad` },
                    { scaleX: RAY_SCALE_X },
                  ],
                },
              ]}
            />
          );
        })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 1,
    height: 1,
    marginLeft: -0.5,
    marginTop: -0.5,
  },
  ray: {
    position: "absolute",
    left: 0,
    top: 0,
    width: RAY_WIDTH,
    height: 1,
  },
});
