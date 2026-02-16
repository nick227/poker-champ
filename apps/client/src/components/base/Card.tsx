import { Pressable, View } from "react-native";
import type { ReactNode } from "react";

export function Card({
  children,
  onPress,
  className = "",
}: {
  children: ReactNode;
  onPress?: () => void;
  className?: string;
}) {
  const content = (
    <View className={`ui-surface ui-p-md ${className}`}>
      {children}
    </View>
  );
  if (onPress) return <Pressable onPress={onPress}>{content}</Pressable>;
  return content;
}
