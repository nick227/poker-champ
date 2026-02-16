import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { ConfirmButton } from "@/components/base/ConfirmButton";
import type { LobbyTableRow } from "@/lib/lobbyTables";

export function GameTableRow({ table, onJoin }: { table: LobbyTableRow; onJoin: () => void }) {
  const stakes = table.blinds ?? "—";
  return (
    <View className="ui-surface-card ui-p-lg rounded-lg border-l-2 border-brand-soft">
      <View className="ui-row ui-inline-3 justify-between">
        <View className="flex-1 min-w-[120px] ui-stack-1">
          <Text variant="h2" className="text-base">{table.name}</Text>
          <Text variant="muted">{table.players}/{table.seats} • {stakes}</Text>
        </View>
        <ConfirmButton title="Join" onPress={onJoin} />
      </View>
    </View>
  );
}
