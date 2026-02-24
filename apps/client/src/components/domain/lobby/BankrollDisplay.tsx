import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import { TABLE } from "@/constants/copy";

export function BankrollDisplay({ amountCents }: { amountCents: number }) {
  return (
    <View className="ui-surface ui-section ui-stack-1 border-gold m-4">
      <Text variant="label">{TABLE.bankroll}</Text>
      <Text variant="h2" className="font-semibold">{formatCents(amountCents)}</Text>
    </View>
  );
}
