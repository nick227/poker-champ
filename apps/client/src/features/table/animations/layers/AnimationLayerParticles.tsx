import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

const FALLBACK_PARTICLE_COLOR = "rgba(255, 180, 80, 0.9)";

/** Max stagger ms so particles ripple out from center instead of popping at once. */
const STAGGER_MAX_MS = 55;
/** Fraction of duration for burst-out (position + scale in). */
const BURST_IN_FRACTION = 0.35;
/** Fraction of duration for opacity in. */
const OPACITY_IN_FRACTION = 0.2;
/** Fraction of duration for fade out. */
const FADE_OUT_FRACTION = 0.5;
/** Scale range: slight size variation per particle (sparks/embers feel). */
const SIZE_FACTOR_MIN = 0.75;
const SIZE_FACTOR_MAX = 1.25;

type Props = {
  durationMs: number;
  delayMs?: number;
  particleCount?: number;
  particleSpread?: number;
  color?: string;
  originOffsetX?: number;
  originOffsetY?: number;
};

export function AnimationLayerParticles({
  durationMs,
  delayMs = 0,
  particleCount = 12,
  particleSpread = 50,
  color,
  originOffsetX = 0,
  originOffsetY = 0,
}: Props) {
  const particleColor = color ?? FALLBACK_PARTICLE_COLOR;
  const particles = useRef(
    Array.from({ length: particleCount }, () => {
      const angle = Math.PI * 2 * Math.random();
      const dist = particleSpread * 0.4 + Math.random() * particleSpread * 0.6;
      return {
        opacity: new Animated.Value(0),
        scale: new Animated.Value(0.3),
        translateX: new Animated.Value(0),
        translateY: new Animated.Value(0),
        targetX: Math.cos(angle) * dist,
        targetY: Math.sin(angle) * dist,
        sizeFactor: SIZE_FACTOR_MIN + Math.random() * (SIZE_FACTOR_MAX - SIZE_FACTOR_MIN),
        staggerMs: Math.random() * STAGGER_MAX_MS,
      };
    })
  ).current;

  useEffect(() => {
    const burstInMs = durationMs * BURST_IN_FRACTION;
    const opacityInMs = durationMs * OPACITY_IN_FRACTION;
    const fadeOutMs = durationMs * FADE_OUT_FRACTION;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    const runOne = (p: (typeof particles)[number]) => {
      Animated.parallel([
        Animated.timing(p.translateX, {
          toValue: p.targetX,
          duration: burstInMs,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
        Animated.timing(p.translateY, {
          toValue: p.targetY,
          duration: burstInMs,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
        Animated.timing(p.opacity, {
          toValue: 1,
          duration: opacityInMs,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        }),
        Animated.timing(p.scale, {
          toValue: p.sizeFactor,
          duration: burstInMs,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
      ]).start(() => {
        Animated.timing(p.opacity, {
          toValue: 0,
          duration: fadeOutMs,
          useNativeDriver: true,
          easing: Easing.in(Easing.ease),
        }).start();
      });
    };

    const startAll = () => {
      particles.forEach((p) => {
        const id = setTimeout(() => runOne(p), p.staggerMs);
        timeouts.push(id);
      });
    };

    if (delayMs > 0) {
      timeouts.push(setTimeout(startAll, delayMs));
    } else {
      startAll();
    }

    return () => timeouts.forEach((id) => clearTimeout(id));
  }, [durationMs, delayMs, particles]);

  const centerStyle = {
    ...styles.center,
    marginLeft: -4 + originOffsetX,
    marginTop: -4 + originOffsetY,
  };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={centerStyle}>
        {particles.map((p, i) => (
          <Animated.View
            key={i}
            style={[
              styles.particle,
              { backgroundColor: particleColor },
              {
                opacity: p.opacity,
                transform: [
                  { translateX: p.translateX },
                  { translateY: p.translateY },
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
  },
});
