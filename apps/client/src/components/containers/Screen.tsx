import { SafeAreaView } from "react-native-safe-area-context";
import type { ReactNode } from "react";
import { Surface } from "@/components/containers/Surface";

export function Screen({ children }: { children: ReactNode }) {
  return (
    <Surface
      as={SafeAreaView}
      styleId="surface.screen.base"
      unsafeStyle={{ backgroundColor: "rgba(0, 0, 0, 0.97)" }}
    >
      {children}
    </Surface>
  );
}
