import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

const PARTICLE_COLOR = "rgba(255, 180, 80, 0.9)";

type Props = {
  durationMs: number;
  delayMs?: number;
  particleCount?: number;
  particleSpread?: number;
};

export function AnimationLayerParticles({
  durationMs,
  delayMs = 0,
  particleCount = 12,
  particleSpread = 50,
}: Props) {
  const particles = useRef(
    Array.from({ length: particleCount }, () => ({
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0.2),
      angle: Math.PI * 2 * Math.random(),
      dist: particleSpread * 0.4 + Math.random() * particleSpread * 0.6,
    }))
  ).current;

  useEffect(() => {
    const run = () => {
      Animated.parallel(
        particles.map((p) =>
          Animated.parallel([
            Animated.timing(p.opacity, {
              toValue: 1,
              duration: durationMs * 0.2,
              useNativeDriver: true,
            }),
            Animated.timing(p.scale, {
              toValue: 1,
              duration: durationMs * 0.5,
              useNativeDriver: true,
            }),
          ])
        )
      ).start(() => {
        Animated.parallel(
          particles.map((p) =>
            Animated.timing(p.opacity, {
              toValue: 0,
              duration: durationMs * 0.5,
              useNativeDriver: true,
            })
          )
        ).start();
      });
    };
    const t = delayMs > 0 ? setTimeout(run, delayMs) : run();
    return () => (typeof t === "number" ? clearTimeout(t) : undefined);
  }, [durationMs, delayMs, particles]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.center}>
        {particles.map((p, i) => (
          <Animated.View
            key={i}
            style={[
              styles.particle,
              {
                opacity: p.opacity,
                transform: [
                  { translateX: Math.cos(p.angle) * p.dist },
                  { translateY: Math.sin(p.angle) * p.dist },
                  { scale: p.scale },
                ],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: "absolute",
    left: "50%",
    top: "50%",
    marginLeft: -4,
    marginTop: -4,
  },
  particle: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: PARTICLE_COLOR,
  },
});
