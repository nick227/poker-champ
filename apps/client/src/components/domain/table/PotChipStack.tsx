import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";

export function PotChipStack({ amountCents }: { amountCents: number }) {
  return (
    <View className="ui-col ui-center ui-stack-0">
      <View className="ui-row items-center" style={{ gap: 4 }}>
        <View className="h-6 w-8 rounded-full border border-border-subtle bg-chip-low" />
        <View className="h-5 w-6 rounded-full border border-border-subtle bg-chip-mid -ml-1" />
        <View className="h-4 w-5 rounded-full border border-border-subtle bg-chip-high -ml-1" />
      </View>
      <Text variant="label" className="text-xs">Pot</Text>
      <Text variant="h2" className="font-semibold">{formatCents(amountCents)}</Text>
    </View>
  );
}
