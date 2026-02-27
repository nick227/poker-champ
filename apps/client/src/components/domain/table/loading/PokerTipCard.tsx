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
    <View className="rounded-2xl border border-border-subtle bg-panel px-4 py-3" style={{ minHeight }}>
      <View className="mb-2 flex-row items-center justify-between">
        <Text variant="label" className="normal-case tracking-normal text-text-subtle">
          Pro Tip
        </Text>
        {tip.category ? (
          <View className="rounded-full border border-border-subtle bg-panel-elevated px-2 py-1">
            <Text variant="caption" className="text-text-subtle">
              {tip.category}
            </Text>
          </View>
        ) : null}
      </View>
      <Text variant="muted" className="leading-5 text-text" numberOfLines={lineCount}>
        {tip.text}
      </Text>
    </View>
  );
}
