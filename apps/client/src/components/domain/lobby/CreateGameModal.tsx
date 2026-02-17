import { useState } from "react";
import { View } from "react-native";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { Button } from "@/components/base/Button";
import { Input } from "@/components/base/Input";
import { Text } from "@/components/base/Text";
import { ChipButton } from "@/components/base/ChipButton";
import { MODAL } from "@/constants/copy";

type CreateGameModalProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (config: {
    name: string;
    maxSeats: number;
    speed: "normal" | "fast";
    visibility: "PUBLIC" | "PRIVATE";
    password?: string;
  }) => void;
};

export function CreateGameModal({ visible, onClose, onSubmit }: CreateGameModalProps) {
  const [name, setName] = useState("New Table");
  const [speed, setSpeed] = useState<"normal" | "fast">("normal");
  const [seats, setSeats] = useState<3 | 6>(6);
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [password, setPassword] = useState("");

  const handleSubmit = () => {
    onSubmit({
      name,
      maxSeats: seats,
      speed,
      visibility,
      password: visibility === "PRIVATE" ? password : undefined,
    });
    onClose();
  };

  return (
    <ModalSheet visible={visible} onClose={onClose} title={MODAL.createGame}>
      <View className="ui-stack-4">
        <Input label="Table Name" value={name} onChangeText={setName} placeholder="Enter table name..." />
        
        <View>
          <Text variant="label">Game Speed</Text>
          <View className="ui-row ui-inline-2">
            <ChipButton title="Fast" selected={speed === "fast"} onPress={() => setSpeed("fast")} />
            <ChipButton title="Normal" selected={speed === "normal"} onPress={() => setSpeed("normal")} />
          </View>
        </View>

        <View>
          <Text variant="label">Visibility</Text>
          <View className="ui-row ui-inline-2">
            <ChipButton title="Public" selected={visibility === "PUBLIC"} onPress={() => setVisibility("PUBLIC")} />
            <ChipButton title="Private" selected={visibility === "PRIVATE"} onPress={() => setVisibility("PRIVATE")} />
          </View>
        </View>

        {visibility === "PRIVATE" && (
          <Input 
            label="Password" 
            value={password} 
            onChangeText={setPassword} 
            placeholder="Invite-only password..." 
            autoCapitalize="none"
          />
        )}

        <View>
          <Text variant="label">Num Players</Text>
          <View className="ui-row ui-inline-2">
            <ChipButton title="3 Players" selected={seats === 3} onPress={() => setSeats(3)} />
            <ChipButton title="6 Players" selected={seats === 6} onPress={() => setSeats(6)} />
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
