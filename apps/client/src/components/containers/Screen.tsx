import { SafeAreaView } from "react-native-safe-area-context";
import type { ReactNode } from "react";

export function Screen({ children }: { children: ReactNode }) {
  return <SafeAreaView className="flex-1 bg-bg px-4">{children}</SafeAreaView>;
}
