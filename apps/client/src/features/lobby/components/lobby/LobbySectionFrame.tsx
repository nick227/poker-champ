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
  const icon = accent === "gold" ? "trophy-outline" : "ellipse-outline";
  const iconClass = accent === "gold" ? "text-gold" : "text-brand";
  return (
    <View className="rounded-2 border border-border overflow-hidden bg-panel">
      <View className="ui-row items-center gap-2 px-3 h-10 border-b border-border/50">
        <Ionicons name={icon} size={14} className={iconClass} />
        <Text variant="label" className="text-[11px] tracking-widest">
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
            {viewAllLabel} ›
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
