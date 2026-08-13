import type { ReactNode } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/base/Text";

type Props = {
  title: string;
  accent: "brand" | "gold";
  children: ReactNode;
};

export function LobbySectionFrame({ title, accent, children }: Props) {
  const gold = accent === "gold";
  const iconColor = gold ? "hsl(42 82% 50%)" : "hsl(158 52% 42%)";
  return (
    <View className="rounded-2 border border-border overflow-hidden">
      <View className="ui-row items-center gap-2 px-3 h-8 border-b border-border/50">
        <Ionicons name={gold ? "trophy" : "ellipse"} size={13} color={iconColor} />
        <Text variant="label" className="font-display text-[11px] tracking-[0.16em] uppercase">
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}
