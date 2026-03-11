import { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import type { ParticleShape } from "../animationTypes";
import { EASING_OPACITY_IN, EASING_OPACITY_OUT, EASING_SCALE } from "../animationEasing";

const FALLBACK_PARTICLE_COLOR = "rgba(255, 180, 80, 0.9)";

/** Max stagger ms so particles ripple out from center instead of popping at once. */
const STAGGER_MAX_MS = 55;
/** Fraction of duration for burst-out (position + scale in). */
const BURST_IN_FRACTION = 0.35;
/** Fraction of duration for opacity in. */
const OPACITY_IN_FRACTION = 0.2;
/** Fraction of duration for fade out. */
const FADE_OUT_FRACTION = 0.5;
/** Scale range: size variation per particle (bolder sparks). */
const SIZE_FACTOR_MIN = 0.8;
const SIZE_FACTOR_MAX = 1.35;
const PARTICLE_SCALE_FROM = 0.2;

function getShapeStyle(shape: ParticleShape): { width: number; height: number; borderRadius: number; marginLeft: number; marginTop: number } {
  switch (shape) {
    case "square":
      return { width: 8, height: 8, borderRadius: 2, marginLeft: -4, marginTop: -4 };
    case "line":
      return { width: 2, height: 12, borderRadius: 1, marginLeft: -1, marginTop: -6 };
    default:
      return { width: 10, height: 10, borderRadius: 5, marginLeft: -5, marginTop: -5 };
  }
}

type Props = {
  durationMs: number;
  delayMs?: number;
  particleCount?: number;
  particleSpread?: number;
  color?: string;
  shape?: ParticleShape;
  originOffsetX?: number;
  originOffsetY?: number;
};

function AnimationLayerParticlesInner({
  durationMs,
  delayMs = 0,
  particleCount = 12,
  particleSpread = 50,
  color,
  shape = "circle",
  originOffsetX = 0,
  originOffsetY = 0,
}: Props) {
  const particleColor = color ?? FALLBACK_PARTICLE_COLOR;
  const shapeStyle = getShapeStyle(shape);
  const particles = useRef(
    Array.from({ length: particleCount }, () => {
      const angle = Math.PI * 2 * Math.random();
      const dist = particleSpread * 0.4 + Math.random() * particleSpread * 0.6;
      return {
        opacity: new Animated.Value(0),
        scale: new Animated.Value(PARTICLE_SCALE_FROM),
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
          easing: EASING_SCALE,
        }),
        Animated.timing(p.translateY, {
          toValue: p.targetY,
          duration: burstInMs,
          useNativeDriver: true,
          easing: EASING_SCALE,
        }),
        Animated.timing(p.opacity, {
          toValue: 1,
          duration: opacityInMs,
          useNativeDriver: true,
          easing: EASING_OPACITY_IN,
        }),
        Animated.timing(p.scale, {
          toValue: p.sizeFactor,
          duration: burstInMs,
          useNativeDriver: true,
          easing: EASING_SCALE,
        }),
      ]).start(() => {
        Animated.timing(p.opacity, {
          toValue: 0,
          duration: fadeOutMs,
          useNativeDriver: true,
          easing: EASING_OPACITY_OUT,
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
    marginLeft: -5 + originOffsetX,
    marginTop: -5 + originOffsetY,
  };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={centerStyle}>
        {particles.map((p, i) => (
          <Animated.View
            key={i}
            style={[
              styles.particleBase,
              shapeStyle,
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
    marginLeft: -5,
    marginTop: -5,
  },
  particleBase: {
    position: "absolute",
    left: 0,
    top: 0,
  },
});

export const AnimationLayerParticles = memo(AnimationLayerParticlesInner);
