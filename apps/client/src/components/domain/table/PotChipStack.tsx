import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";

export function PotChipStack({ amountCents }: { amountCents: number }) {
  return (
    <View className="ui-col ui-center ui-stack-0">
      <Text variant="label" className="text-xs">Pot</Text>
      <Text variant="h2" className="font-semibold">{formatCents(amountCents)}</Text>
    </View>
  );
}
