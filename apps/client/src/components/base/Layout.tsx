import { View } from "react-native";
import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

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

export function Spacer({
  flex = 1,
  style,
}: {
  flex?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[{ flex }, style]} />;
}

export function Divider({ className = "" }: { className?: string }) {
  return <View className={`ui-divider ${className}`} />;
}
