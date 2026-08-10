import { useEffect, useRef } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import type { AwardGrant } from "@/types/awards";
import { parseGraphic } from "@/services/awards.service";

const AUTO_DISMISS_MS = 3000;

/** Same surface language as Toast (error reporting): dark panel, light body text. */
const TOAST_SURFACE = "absolute bottom-24 left-4 z-50 max-w-sm rounded-lg border border-border bg-panel ui-p-4";

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
      className={`${TOAST_SURFACE} flex-row items-start gap-3`}
      data-testid="award-toast"
    >
      <Text variant="h2" className="leading-none">
        {parseGraphic(first.graphic)}
      </Text>
      <View className="min-w-0 flex-1">
        <Text variant="body">{first.name}</Text>
        <Text variant="muted" className="mt-0.5" numberOfLines={2}>
          {first.reason}
        </Text>
        {restCount > 0 ? (
          <Text variant="muted" className="mt-1">
            +{restCount} more award{restCount === 1 ? "" : "s"}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
