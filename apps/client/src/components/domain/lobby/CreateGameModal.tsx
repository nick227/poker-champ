import { useState } from "react";
import { View } from "react-native";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { ChipButton } from "@/components/base/ChipButton";
import { MODAL } from "@/constants/copy";

type CreateGameModalProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (config: {
    maxSeats: number;
    speed: "normal" | "fast";
  }) => void;
};

export function CreateGameModal({ visible, onClose, onSubmit }: CreateGameModalProps) {
  const [speed, setSpeed] = useState<"normal" | "fast">("normal");
  const [seats, setSeats] = useState<3 | 6>(6);

  const handleSubmit = () => {
    onSubmit({
      maxSeats: seats,
      speed,
    });
    onClose();
  };

  return (
    <ModalSheet visible={visible} onClose={onClose} title={MODAL.createGame}>
      <View className="ui-stack-4">
        <View>
          <Text variant="label">Game Speed</Text>
          <View className="ui-row ui-inline-2">
            <ChipButton title="Fast" selected={speed === "fast"} onPress={() => setSpeed("fast")} />
            <ChipButton title="Normal" selected={speed === "normal"} onPress={() => setSpeed("normal")} />
          </View>
        </View>
        <View>
          <Text variant="label">Seats</Text>
          <View className="ui-row ui-inline-2">
            <ChipButton title="3" selected={seats === 3} onPress={() => setSeats(3)} />
            <ChipButton title="6" selected={seats === 6} onPress={() => setSeats(6)} />
          </View>
        </View>
        <View className="ui-row ui-inline-2">
          <Button variant="ghost" title="Cancel" onPress={onClose} />
          <Button variant="primary" title="Apply" onPress={handleSubmit} />
        </View>
      </View>
    </ModalSheet>
  );
}
