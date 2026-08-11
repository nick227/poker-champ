import { useEffect, useMemo, useRef } from "react";
import { Animated, Platform, View } from "react-native";
import { EASING_SCALE } from "./animationEasing";

/**
 * Continuous confetti-fall ambience for the tournament champion/ITM reveal (a full-screen
 * Modal, not the table overlay). Distinct in kind from AnimationLayerParticles — that layer is
 * a one-shot burst radiating out from a point (POT_WIN/ALL_IN accents); this is a sustained,
 * full-width "it's raining confetti" atmosphere that loops for as long as the reveal is shown.
 * Forcing this into the burst primitive would be a visual regression, not a cleanup — kept as
 * its own component, but moved into animations/ and put on the same easing system as everything
 * else here instead of a one-off, easing-free Animated.timing.
 */
const PARTICLE_COUNT = 28;
const COLORS = ["#f5d76e", "#d4a84b", "#fff4c2", "#e8b923", "#ff6b35", "#c9a227"];

type ParticleSpec = {
  leftPct: number;
  delayMs: number;
  color: string;
  size: number;
};

function buildParticles(): ParticleSpec[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    leftPct: ((i * 37) % 100) + 2,
    delayMs: (i * 47) % 900,
    color: COLORS[i % COLORS.length]!,
    size: 6 + (i % 4),
  }));
}

export function TournamentConfettiRain({ active }: { active: boolean }) {
  const particles = useMemo(() => buildParticles(), []);
  const anims = useRef(particles.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!active) return;
    const loops = anims.map((anim, i) => {
      const spec = particles[i]!;
      return Animated.loop(
        Animated.sequence([
          Animated.delay(spec.delayMs),
          Animated.timing(anim, {
            toValue: 1,
            duration: 2200 + (i % 5) * 200,
            useNativeDriver: Platform.OS !== "web",
            easing: EASING_SCALE,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: Platform.OS !== "web",
          }),
        ]),
      );
    });
    for (const loop of loops) loop.start();
    return () => {
      for (const loop of loops) loop.stop();
      for (const anim of anims) anim.setValue(0);
    };
  }, [active, anims, particles]);

  if (!active) return null;

  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
      {particles.map((spec, i) => {
        const progress = anims[i]!;
        const translateY = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [-40, 420],
        });
        const opacity = progress.interpolate({
          inputRange: [0, 0.1, 0.85, 1],
          outputRange: [0, 1, 1, 0],
        });
        const rotate = progress.interpolate({
          inputRange: [0, 1],
          outputRange: ["0deg", `${(i % 2 === 0 ? 1 : -1) * 360}deg`],
        });
        return (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              left: `${spec.leftPct}%`,
              top: 0,
              width: spec.size,
              height: spec.size * 1.4,
              borderRadius: 2,
              backgroundColor: spec.color,
              opacity,
              transform: [{ translateY }, { rotate }],
            }}
          />
        );
      })}
    </View>
  );
}
