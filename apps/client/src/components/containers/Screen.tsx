import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Surface } from "@/components/containers/Surface";

/** Single View + insets so we own the only background layer (avoids SafeAreaView inner default). */
export function Screen({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Surface as={View} styleId="surface.screen.base">
      <View
        style={{
          flex: 1,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        {children}
      </View>
    </Surface>
  );
}
