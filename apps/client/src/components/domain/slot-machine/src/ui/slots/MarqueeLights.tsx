import React, { useMemo } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { casino } from "../../theme/casinoCabinet";

const TOP = 16;
const SIDE = 10;
const BULB = 9;

type Props = {
  active: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Continuous marquee bulb ring around the reel housing. Always faintly lit; chases while spinning. */
export function MarqueeLights({ active, children, style }: Props) {
  const phase = useSharedValue(0);
  const chasing = useSharedValue(0);

  React.useEffect(() => {
    if (!active) {
      chasing.value = 0;
      phase.value = withTiming(0, { duration: 280 });
      return;
    }
    chasing.value = 1;
    phase.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.linear }), -1, false);
  }, [active, phase, chasing]);

  const top = useMemo(() => Array.from({ length: TOP }, (_, i) => i), []);
  const bottom = useMemo(() => Array.from({ length: TOP }, (_, i) => i + TOP), []);
  const left = useMemo(() => Array.from({ length: SIDE }, (_, i) => i + TOP * 2), []);
  const right = useMemo(() => Array.from({ length: SIDE }, (_, i) => i + TOP * 2 + SIDE), []);
  const total = TOP * 2 + SIDE * 2;

  return (
    <View style={[{ position: "relative", padding: 14 }, style]}>
      <View style={styles.topRow}>
        {top.map((i) => (
          <Bulb key={i} index={i} total={total} phase={phase} chasing={chasing} />
        ))}
      </View>
      <View style={styles.bottomRow}>
        {bottom.map((i) => (
          <Bulb key={i} index={i} total={total} phase={phase} chasing={chasing} />
        ))}
      </View>
      <View style={styles.leftCol}>
        {left.map((i) => (
          <Bulb key={i} index={i} total={total} phase={phase} chasing={chasing} />
        ))}
      </View>
      <View style={styles.rightCol}>
        {right.map((i) => (
          <Bulb key={i} index={i} total={total} phase={phase} chasing={chasing} />
        ))}
      </View>
      {children}
    </View>
  );
}

function Bulb({
  index,
  total,
  phase,
  chasing,
}: {
  index: number;
  total: number;
  phase: SharedValue<number>;
  chasing: SharedValue<number>;
}) {
  const a = useAnimatedStyle(() => {
    if (chasing.value < 0.5) {
      return {
        opacity: 0.55,
        backgroundColor: casino.bulbOff,
        shadowOpacity: 0.25,
      };
    }
    const t = (phase.value + index / total) % 1;
    const wave = Math.max(0, Math.sin(t * Math.PI * 2));
    const intensity = 0.35 + 0.65 * wave;
    return {
      opacity: intensity,
      backgroundColor: wave > 0.55 ? casino.bulbOn : casino.bulbOff,
      shadowOpacity: 0.25 + wave * 0.55,
    };
  });

  return <Animated.View style={[styles.bulb, a]} />;
}

const styles = {
  topRow: {
    position: "absolute" as const,
    top: 2,
    left: 12,
    right: 12,
    height: BULB,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    pointerEvents: "none" as const,
    zIndex: 2,
  },
  bottomRow: {
    position: "absolute" as const,
    bottom: 2,
    left: 12,
    right: 12,
    height: BULB,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    pointerEvents: "none" as const,
    zIndex: 2,
  },
  leftCol: {
    position: "absolute" as const,
    top: 16,
    bottom: 16,
    left: 2,
    width: BULB,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    pointerEvents: "none" as const,
    zIndex: 2,
  },
  rightCol: {
    position: "absolute" as const,
    top: 16,
    bottom: 16,
    right: 2,
    width: BULB,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    pointerEvents: "none" as const,
    zIndex: 2,
  },
  bulb: {
    width: BULB,
    height: BULB,
    borderRadius: BULB / 2,
    backgroundColor: casino.bulbOff,
    borderWidth: 1,
    borderColor: casino.goldHi,
    shadowColor: casino.bulbOn,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 4,
    elevation: 3,
  },
};
