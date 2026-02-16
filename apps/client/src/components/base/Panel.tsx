import { View } from "react-native";
import type { ReactNode } from "react";

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <View className={`ui-surface-card ui-p-lg ${className}`}>
      {children}
    </View>
  );
}
