import { View } from "react-native";
import { Text } from "@/components/base/Text";
import type { Tip } from "./loadingTips";

type PokerTipCardProps = {
  tip: Tip;
  compact?: boolean;
};

export function PokerTipCard({ tip, compact = false }: PokerTipCardProps) {
  const minHeight = compact ? 108 : 124;
  const lineCount = compact ? 2 : 3;

  return (
    <View className="rounded-2xl border border-border-subtle bg-panel" style={{ minHeight }}>
      <Text variant="muted" className="leading-5 text-text" numberOfLines={lineCount}>
        {tip.text}
      </Text>
    </View>
  );
}
