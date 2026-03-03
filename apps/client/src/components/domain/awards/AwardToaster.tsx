import { View, Pressable } from "react-native";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import type { AwardGrant } from "@/types/awards";
import { parseGraphic } from "@/services/awards.service";

export function AwardToaster({
  awards,
  onDismiss,
}: {
  awards: AwardGrant[];
  onDismiss: () => void;
}) {
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
  className="mx-4 mt-2 mb-4 flex-row items-start gap-3 rounded-xl border-2 border-brand/50 bg-brand/10 p-3"
>
  {/* Icon */}
  <View className="rounded-lg bg-panel p-2 min-w-[44px] items-center justify-center">
    <Text variant="h1" className="text-2xl">
      {parseGraphic(first.graphic)}
    </Text>
  </View>

  {/* Info block (expands) */}
  <View className="flex-1 min-w-0">
    <Text variant="label" className="text-brand font-semibold">
      {first.name}
    </Text>
    <Text variant="body" className="text-sm mt-0.5">
      {first.reason}
    </Text>
    {restCount > 0 && (
      <Text variant="muted" className="text-xs mt-1">
        +{restCount} more award{restCount === 1 ? "" : "s"} earned
      </Text>
    )}
  </View>

  {/* Button */}
  <View className="justify-start">
    <Button
      title="Got it"
      variant="ghost"
      onPress={onDismiss}
    />
  </View>
</Pressable>
  );
}
