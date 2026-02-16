import { useState } from "react";
import { View } from "react-native";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { Input } from "@/components/base/Input";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { MODAL } from "@/constants/copy";

type CreateGameModalProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (config: {
    name: string;
    maxSeats: number;
    smallBlindCents: number;
    bigBlindCents: number;
    minBuyInCents: number;
    maxBuyInCents: number;
    visibility: "PUBLIC" | "PRIVATE";
  }) => void;
};

export function CreateGameModal({ visible, onClose, onSubmit }: CreateGameModalProps) {
  const [name, setName] = useState("Hold'em");
  const [seats, setSeats] = useState("6");
  const [sb, setSb] = useState("100");
  const [bb, setBb] = useState("200");
  const [minBuy, setMinBuy] = useState("2000");
  const [maxBuy, setMaxBuy] = useState("20000");

  const handleSubmit = () => {
    const seatsNum = parseInt(seats, 10) || 6;
    const sbNum = parseInt(sb, 10) || 100;
    const bbNum = parseInt(bb, 10) || 200;
    const minNum = parseInt(minBuy, 10) || 2000;
    const maxNum = parseInt(maxBuy, 10) || 20000;
    onSubmit({
      name,
      maxSeats: seatsNum,
      smallBlindCents: sbNum,
      bigBlindCents: bbNum,
      minBuyInCents: minNum,
      maxBuyInCents: maxNum,
      visibility: "PUBLIC",
    });
    onClose();
  };

  return (
    <ModalSheet visible={visible} onClose={onClose} title={MODAL.createGame}>
      <View className="ui-stack-4">
        <Input label="Table name" value={name} onChangeText={setName} />
        <Input label="Seats" value={seats} onChangeText={setSeats} keyboardType="numeric" />
        <Input label="Small blind (cents)" value={sb} onChangeText={setSb} keyboardType="numeric" />
        <Input label="Big blind (cents)" value={bb} onChangeText={setBb} keyboardType="numeric" />
        <Input label="Min buy-in (cents)" value={minBuy} onChangeText={setMinBuy} keyboardType="numeric" />
        <Input label="Max buy-in (cents)" value={maxBuy} onChangeText={setMaxBuy} keyboardType="numeric" />
        <View className="ui-row ui-inline-2">
          <Button variant="ghost" title="Cancel" onPress={onClose} />
          <Button variant="primary" title="Apply" onPress={handleSubmit} />
        </View>
      </View>
    </ModalSheet>
  );
}
