import React, { useMemo } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import { useTheme } from "../../theme/ThemeProvider";
import { makeStyles } from "../../theme/styleEngine";

export function MarqueeLights({ active }: { active: boolean }) {
  const { theme } = useTheme();
  const phase = useSharedValue(0);

  React.useEffect(() => {
    if (!active) {
      phase.value = 0;
      return;
    }
    phase.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, true);
  }, [active, phase]);

  const bulbs = useMemo(() => Array.from({ length: 18 }, (_, i) => i), []);
  const s = makeStyles(theme, (t) => ({
    row: {
      width: "100%",
      height: 10,
      paddingHorizontal: 6,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      pointerEvents: "none" as const,
    },
    bulb: {
      width: 8,
      height: 8,
      backgroundColor: t.colors.accent0,
    },
  }));

  if (!active) return <View style={s.row} />;

  return (
    <View className="" style={s.row}>
      {bulbs.map((i) => (
        <Bulb key={i} i={i} phase={phase} baseStyle={s.bulb} />
      ))}
    </View>
  );
}

function Bulb({ i, phase, baseStyle }: { i: number; phase: SharedValue<number>; baseStyle: any }) {
  const a = useAnimatedStyle(() => {
    const t = (phase.value + i * 0.08) % 1;
    const wave = Math.max(0, Math.sin(t * Math.PI * 2));
    const intensity = 0.25 + 0.75 * wave;
    return { opacity: intensity };
  });
  return <Animated.View style={[baseStyle, a]} />;
}
