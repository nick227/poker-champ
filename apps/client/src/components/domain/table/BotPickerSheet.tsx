import { ActivityIndicator, View } from "react-native";
import type { BotSummary } from "@poker-champ/realtime-contract";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";

export function BotPickerSheet({
  visible,
  loading,
  bots,
  onClose,
  onPick,
}: {
  visible: boolean;
  loading: boolean;
  bots: BotSummary[];
  onClose: () => void;
  onPick: (botId: string) => void;
}) {
  return (
    <ModalSheet visible={visible} onClose={onClose} title="Add Bot">
      <View className="ui-stack-2">
        {loading ? (
          <View className="ui-row items-center ui-inline-2">
            <ActivityIndicator />
            <Text variant="muted">Loading bots...</Text>
          </View>
        ) : null}
        {!loading && bots.length === 0 ? <Text variant="muted">No bots available</Text> : null}
        {bots.map((bot) => (
          <Button
            key={bot.id}
            variant="ghost"
            title={bot.name}
            onPress={() => onPick(bot.id)}
          />
        ))}
      </View>
    </ModalSheet>
  );
}
