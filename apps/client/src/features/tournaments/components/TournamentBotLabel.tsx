import { View } from "react-native";
import { Text } from "@/components/base/Text";

export function TournamentBotLabel() {
  return (
    <View className="rounded bg-panel-elevated border border-border-subtle px-1.5 py-0.5 shrink-0">
      <Text variant="label" className="text-muted text-xs">
        Bot
      </Text>
    </View>
  );
}
