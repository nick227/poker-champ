import { Animated, Easing, View } from "react-native";
import { useEffect, useRef } from "react";

type LoadingIndicatorMinimalProps = {
  reducedMotion?: boolean;
};

const DOT_COUNT = 3;

export function LoadingIndicatorMinimal({ reducedMotion = false }: LoadingIndicatorMinimalProps) {
  const dotValuesRef = useRef([
    new Animated.Value(0.35),
    new Animated.Value(0.35),
    new Animated.Value(0.35),
  ]);
  const dotValues = dotValuesRef.current;

  useEffect(() => {
    if (reducedMotion) {
      dotValues.forEach((value) => value.setValue(0.8));
      return;
    }

    const loops = dotValues.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 120),
          Animated.timing(value, {
            toValue: 1,
            duration: 360,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0.35,
            duration: 360,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
    );

    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [dotValues, reducedMotion]);

  return (
    <View className="flex-row items-center justify-center gap-2" accessibilityLabel="Loading">
      {Array.from({ length: DOT_COUNT }).map((_, index) => {
        const value = dotValues[index];
        return (
          <Animated.View
            key={index}
            className="h-2 w-2 rounded-full bg-brand"
            style={{
              opacity: value,
              transform: [
                {
                  scale: value.interpolate({
                    inputRange: [0.35, 1],
                    outputRange: [0.85, 1.15],
                  }),
                },
              ],
            }}
          />
        );
      })}
    </View>
  );
}
