import { useEffect, useRef } from "react";
import { Animated, Platform, type ViewProps } from "react-native";

export function FadeTransition({
  visible,
  duration = 200,
  children,
  ...props
}: ViewProps & { visible: boolean; duration?: number }) {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [visible, duration, opacity]);

  return (
    <Animated.View {...props} style={[props.style, { opacity }]} pointerEvents={visible ? "auto" : "none"}>
      {children}
    </Animated.View>
  );
}
