import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

const RAY_COLOR = "rgba(255, 100, 50, 0.5)";
const RAY_WIDTH = 2;

type Props = {
  durationMs: number;
  delayMs?: number;
  rays?: number;
};

export function AnimationLayerBurst({ durationMs, delayMs = 0, rays = 8 }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const start = () => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: durationMs * 0.3,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.2,
          duration: durationMs,
          useNativeDriver: true,
        }),
      ]).start(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: durationMs * 0.5,
          useNativeDriver: true,
        }).start();
      });
    };
    const t = delayMs > 0 ? setTimeout(start, delayMs) : start();
    return () => (typeof t === "number" ? clearTimeout(t) : undefined);
  }, [durationMs, delayMs, opacity, scale]);

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
                {
                  transform: [
                    { translateX: -RAY_WIDTH / 2 },
                    { rotate: `${angle}rad` },
                    { scaleX: 60 },
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
    backgroundColor: RAY_COLOR,
  },
});
