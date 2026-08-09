import { Animated, Easing, View } from "react-native";
import { useEffect, useRef } from "react";
import { GAME_PANEL_LAYOUT } from "./gamePanel.layout";
import { Surface } from "@/components/containers/Surface";
import { USE_NATIVE_DRIVER } from "@/theme/animation";

export function GameTablePanelSkeleton() {
  const pulse = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(pulse, {
          toValue: 0.7,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Surface
      as={Animated.View}
      styleId="surface.list.panel"
      style={{ opacity: pulse, minHeight: GAME_PANEL_LAYOUT.cardMinHeight }}
    >
      <View className="ui-stack-3" style={{ minHeight: GAME_PANEL_LAYOUT.contentMinHeight }}>
        <View className="ui-row items-center justify-between" style={{ minHeight: GAME_PANEL_LAYOUT.headerMinHeight }}>
          <View className="ui-row items-center gap-2">
            <View className="w-10 h-10 rounded-full bg-panel border border-border/70" />
            <View className="ui-stack-1">
              <View className="h-4 w-28 rounded bg-panel border border-border/50" />
              <View className="h-3 w-20 rounded bg-panel border border-border/50" />
            </View>
          </View>
          <View className="h-5 w-12 rounded-full bg-panel border border-border/50" />
        </View>
        <View className="ui-stack-1 justify-center" style={{ minHeight: GAME_PANEL_LAYOUT.primaryLineMinHeight }}>
          <View className="h-4 w-32 rounded bg-panel border border-border/50" />
          <View className="h-8 w-36 rounded bg-panel border border-border/50" />
        </View>
        <View className="ui-row flex-wrap" style={{ minHeight: GAME_PANEL_LAYOUT.statsMinHeight }}>
          <View className="h-9 w-[46%] rounded bg-panel border border-border/50" />
          <View className="h-9 w-[46%] rounded bg-panel border border-border/50" />
          <View className="h-9 w-[46%] rounded bg-panel border border-border/50" />
          <View className="h-9 w-[46%] rounded bg-panel border border-border/50" />
        </View>
      </View>
      <View className="mt-3 pt-3 border-t border-border/60 ui-row items-center justify-between" style={{ minHeight: GAME_PANEL_LAYOUT.footerMinHeight }}>
        <View className="h-3 w-28 rounded bg-panel border border-border/50" />
        <View className="h-10 w-28 rounded-md bg-panel border border-border/50" />
      </View>
    </Surface>
  );
}
