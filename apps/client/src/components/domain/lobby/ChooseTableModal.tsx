import { useState, useEffect } from "react";
import { View } from "react-native";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { Slider } from "@/components/base/Slider";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { ChipButton } from "@/components/base/ChipButton";
import { Toggle } from "@/components/base/Toggle";
import { formatCents } from "@/lib/format";
import { MODAL } from "@/constants/copy";

type ChooseTableModalProps = {
  visible: boolean;
  onClose: () => void;
  balanceCents: number;
  minBuyInCents: number;
  maxBuyInCents: number;
  onApply: (opts: { buyInCents: number }) => void;
  title?: string;
};

export function ChooseTableModal({
  visible,
  onClose,
  balanceCents,
  minBuyInCents,
  maxBuyInCents,
  onApply,
  title,
}: ChooseTableModalProps) {
  const canAffordMin = balanceCents >= minBuyInCents;
  const maxAllowed = Math.min(maxBuyInCents, balanceCents);
  const [buyInCents, setBuyInCents] = useState(minBuyInCents);
  const [buyInAtMax, setBuyInAtMax] = useState(false);

  useEffect(() => {
    if (buyInAtMax) setBuyInCents(maxAllowed);
  }, [buyInAtMax, maxAllowed]);

  const handleApply = () => {
    if (!canAffordMin) return;
    onApply({ buyInCents });
    onClose();
  };

  return (
    <ModalSheet visible={visible} onClose={onClose} title={title ?? MODAL.chooseTable}>
      <View className="ui-stack-4">
        <View>
          <Text variant="label">Your Balance</Text>
          <Text variant="h2" className="text-brand">{formatCents(balanceCents)}</Text>
        </View>
        {!canAffordMin ? (
          <Text variant="body" className="text-danger">
            Insufficient funds. Minimum buy-in is {formatCents(minBuyInCents)}. Deposit or choose another table.
          </Text>
        ) : (
          <>
            <View className="ui-row justify-between">
              <Text variant="label">Buy-in at max</Text>
              <Toggle value={buyInAtMax} onValueChange={setBuyInAtMax} />
            </View>
            <View>
              <Text variant="label">Buy-in</Text>
              <Slider
                value={buyInCents}
                min={minBuyInCents}
                max={maxAllowed}
                onValueChange={(v) => { setBuyInCents(v); setBuyInAtMax(v >= maxAllowed); }}
                step={100}
                disabled={buyInAtMax}
              />
            </View>
          </>
        )}
        <View className="ui-row ui-inline-2">
          <Button variant="ghost" title="Cancel" onPress={onClose} />
          <Button variant="primary" title="Apply" onPress={handleApply} disabled={!canAffordMin} />
        </View>
      </View>
    </ModalSheet>
  );
}
