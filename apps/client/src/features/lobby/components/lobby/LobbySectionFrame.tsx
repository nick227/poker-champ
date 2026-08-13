import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/base/Text";

type Props = {
  title: string;
  accent: "brand" | "gold";
  viewAllLabel?: string;
  onViewAll?: () => void;
  children: ReactNode;
};

export function LobbySectionFrame({
  title,
  accent,
  viewAllLabel,
  onViewAll,
  children,
}: Props) {
  const gold = accent === "gold";
  const iconColor = gold ? "hsl(42 82% 50%)" : "hsl(158 52% 42%)";
  return (
    <View className="rounded-2 border border-border overflow-hidden bg-panel">
      <View className="ui-row items-center gap-2 px-3 h-10 border-b border-border/50">
        <Ionicons name={gold ? "trophy" : "ellipse"} size={14} color={iconColor} />
        <Text variant="label" className="font-display text-[12px] tracking-[0.16em] uppercase">
          {title}
        </Text>
      </View>
      {children}
      {onViewAll && viewAllLabel ? (
        <Pressable
          onPress={onViewAll}
          className="ui-center py-3 border-t border-border/40"
          accessibilityRole="link"
        >
          <Text variant="muted" className="text-[13px]">
            {viewAllLabel} {'>'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
