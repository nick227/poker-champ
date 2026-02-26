import { useState, useMemo } from "react";
import { View } from "react-native";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { Button } from "@/components/base/Button";
import { Input } from "@/components/base/Input";
import { Text } from "@/components/base/Text";
import { ChipButton } from "@/components/base/ChipButton";
import { MODAL } from "@/constants/copy";
import { getRandomTableName } from "@/services/tableNames";
import {
  BLINDS_OPTIONS,
  getValidMinBuyInOptions,
  getDefaultMinBuyInCents,
  getMaxBuyInCents,
} from "./createGame.constants";

const DEFAULT_BLINDS_INDEX = 3; // $1 / $2

export type CreateGameConfig = {
  name: string;
  maxSeats: number;
  smallBlindCents: number;
  bigBlindCents: number;
  minBuyInCents: number;
  maxBuyInCents: number;
  visibility: "PUBLIC" | "PRIVATE";
  password?: string;
  showStats: boolean;
};

type CreateGameModalProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (config: CreateGameConfig) => void;
};

export function CreateGameModal({ visible, onClose, onSubmit }: CreateGameModalProps) {
  const [name, setName] = useState(getRandomTableName());
  const [blindsIndex, setBlindsIndex] = useState(DEFAULT_BLINDS_INDEX);
  const [seats, setSeats] = useState<3 | 6>(6);
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [password, setPassword] = useState("");
  const [showStats, setShowStats] = useState(true);

  const { smallBlindCents, bigBlindCents } = BLINDS_OPTIONS[blindsIndex];
  const validMinOptions = useMemo(() => getValidMinBuyInOptions(bigBlindCents), [bigBlindCents]);
  const defaultMinCents = useMemo(() => getDefaultMinBuyInCents(bigBlindCents), [bigBlindCents]);
  const [minBuyInCents, setMinBuyInCents] = useState(defaultMinCents);

  const currentMinValid = validMinOptions.some((o) => o.minBuyInCents === minBuyInCents);
  const effectiveMinBuyInCents = currentMinValid ? minBuyInCents : defaultMinCents;

  const handleBlindsChange = (index: number) => {
    setBlindsIndex(index);
    const bb = BLINDS_OPTIONS[index].bigBlindCents;
    setMinBuyInCents(getDefaultMinBuyInCents(bb));
  };

  const handleSubmit = () => {
    onSubmit({
      name,
      maxSeats: seats,
      smallBlindCents,
      bigBlindCents,
      minBuyInCents: effectiveMinBuyInCents,
      maxBuyInCents: getMaxBuyInCents(bigBlindCents),
      visibility,
      password: visibility === "PRIVATE" ? password : undefined,
      showStats,
    });
    onClose();
  };

  return (
    <ModalSheet visible={visible} onClose={onClose} title={MODAL.createGame}>
      <View className="">
        <Input style={{ marginTop: 4 }} label="Table Name" value={name} onChangeText={setName} placeholder="Enter table name..." />

        <View>
          <Text variant="label">Blinds</Text>
          <View className="flex-row flex-wrap gap-2">
            {BLINDS_OPTIONS.map((opt, i) => (
              <ChipButton
                key={opt.label}
                title={opt.label}
                selected={blindsIndex === i}
                onPress={() => handleBlindsChange(i)}
              />
            ))}
          </View>
        </View>

        <View>
          <Text variant="label">Min buy-in</Text>
          <View className="flex-row flex-wrap gap-2 mt-2 mb-8">
            {validMinOptions.map((opt) => (
              <ChipButton
                key={opt.minBuyInCents}
                title={opt.label}
                selected={effectiveMinBuyInCents === opt.minBuyInCents}
                onPress={() => setMinBuyInCents(opt.minBuyInCents)}
              />
            ))}
          </View>
        </View>

        <View>
          <Text variant="label">Visibility</Text>
          <View className="ui-row ui-inline-2 mt-2 mb-8">
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
          <View className="ui-row ui-inline-2 mb-8 mt-2">
            <ChipButton title="3 Players" selected={seats === 3} onPress={() => setSeats(3)} />
            <ChipButton title="6 Players" selected={seats === 6} onPress={() => setSeats(6)} />
          </View>
        </View>

        <View>
          <Text variant="label">Show Stats</Text>
          <View className="ui-row ui-inline-2 mb-8 mt-2">
            <ChipButton title="On" selected={showStats === true} onPress={() => setShowStats(true)} />
            <ChipButton title="Off" selected={showStats === false} onPress={() => setShowStats(false)} />
          </View>
        </View>

        <View className="ui-row ui-inline-2 justify-end w-full">
          <Button variant="ghost" title="Cancel" onPress={onClose} />
          <Button variant="primary" title="Apply" onPress={handleSubmit} />
        </View>
      </View>
    </ModalSheet>
  );
}
