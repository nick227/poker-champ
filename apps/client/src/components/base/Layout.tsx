import { View } from "react-native";
import type { ReactNode } from "react";

export function Row({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <View className={`ui-row ${className}`}>{children}</View>;
}

export function Column({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <View className={`ui-col ${className}`}>{children}</View>;
}

export function Spacer({ flex = 1 }: { flex?: number }) {
  return <View style={{ flex }} />;
}

export function Divider({ className = "" }: { className?: string }) {
  return <View className={`ui-divider ${className}`} />;
}
