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
    <View className="rounded-3 border border-border border-t-2 border-t-brand bg-panel overflow-hidden">
      <View className="ui-row items-center gap-2 px-4 h-11 border-b border-border/70">
        <Ionicons name={gold ? "trophy" : "ellipse"} size={13} color={iconColor} />
        <Text variant="label" className="text-[11px] font-semibold tracking-[0.12em] uppercase">
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}
