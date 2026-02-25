import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { formatCents } from "@/lib/format";
import { TABLE } from "@/constants/copy";

export function BankrollDisplay({
  amountCents,
  onDeposit,
}: {
  amountCents: number;
  onDeposit?: () => void;
}) {
  return (
    <View className="ui-row items-center justify-between">
      <View className="bankroll-container ui-surface ui-section border-gold my-4 py-2">
        <Text variant="label">{TABLE.bankroll}</Text>
        <Text variant="h2" className="font-semibold">{formatCents(amountCents)}</Text>
      </View>

      {onDeposit ? (
        <Button variant="ghost" title="Deposit" onPress={onDeposit} />
      ) : null}

    </View>
  );
}
