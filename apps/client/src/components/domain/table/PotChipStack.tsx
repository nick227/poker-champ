import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";

export function PotChipStack({ amountCents }: { amountCents: number }) {
  return (
    <View collapsable={false} className="ui-col ui-center ui-stack-0" style={{ minHeight: 44, minWidth: 72 }}>
      <Text variant="label" className="text-xs" allowFontScaling={false}>Pot</Text>
      <Text variant="h2" className="font-semibold" allowFontScaling={false}>{formatCents(amountCents)}</Text>
    </View>
  );
}
