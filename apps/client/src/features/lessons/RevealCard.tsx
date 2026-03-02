import { View } from "react-native";
import { Text } from "@/components/base/Text";
import type { RevealLayerResult } from "@/features/lessons-v2/runtime";

export function RevealCard({ reveal }: { reveal: RevealLayerResult }) {
  const explanation =
    typeof reveal.payload.explanation === "string" ? reveal.payload.explanation : null;
  const evDelta =
    typeof reveal.payload.evDelta === "number" ? reveal.payload.evDelta : null;

  return (
    <View className="mt-2 rounded-lg border border-border bg-background px-3 py-2">
      <Text variant="label" className="text-[10px] uppercase tracking-wider">
        {reveal.title ?? reveal.key}
      </Text>
      {explanation ? (
        <Text variant="body" className="mt-1">
          {explanation}
        </Text>
      ) : null}
      {evDelta != null ? (
        <Text variant="muted" className="mt-1 text-xs">
          EV delta: {evDelta.toFixed(2)}
        </Text>
      ) : null}
    </View>
  );
}

