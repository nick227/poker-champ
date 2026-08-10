import { useEffect, useRef } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import type { AwardGrant } from "@/types/awards";
import { parseGraphic } from "@/services/awards.service";

const AUTO_DISMISS_MS = 3000;

export function AwardToaster({
  awards,
  onDismiss,
}: {
  awards: AwardGrant[];
  onDismiss: () => void;
}) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (awards.length === 0) return;
    const id = setTimeout(() => onDismissRef.current(), AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [awards]);

  if (awards.length === 0) return null;

  const sorted = [...awards].sort((a, b) => {
    if (a.tierWeight !== b.tierWeight) return b.tierWeight - a.tierWeight;
    if (a.priorityWeight !== b.priorityWeight) return b.priorityWeight - a.priorityWeight;
    return a.awardId.localeCompare(b.awardId);
  });
  const first = sorted[0];
  const restCount = sorted.length - 1;

  return (
    <Pressable
      onPress={onDismiss}
      accessibilityRole="button"
      accessibilityLabel={`Award earned: ${first.name}`}
      className="absolute bottom-24 left-4 z-50 max-w-[220px] flex-row items-center gap-2 rounded-md border border-brand/40 bg-panel/95 px-2.5 py-1.5"
    >
      <Text variant="body" className="text-base leading-none">
        {parseGraphic(first.graphic)}
      </Text>
      <View className="min-w-0 flex-1">
        <Text variant="label" className="text-brand text-xs font-semibold" numberOfLines={1}>
          {first.name}
        </Text>
        {restCount > 0 ? (
          <Text variant="muted" className="text-[10px]" numberOfLines={1}>
            +{restCount} more
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
