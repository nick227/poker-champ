import { ScrollView, View } from "react-native";
import type { OnlinePlayerSummary } from "@poker-champ/realtime-contract";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";

function locationText(location: OnlinePlayerSummary["location"]): string {
  switch (location.kind) {
    case "LOBBY":
      return "Lobby";
    case "TABLE":
      return `Table: ${location.tableName}`;
    case "MULTI_TABLE":
      return `Multi-table (${location.tables.length})`;
    default:
      return "Unknown";
  }
}

export function OnlinePlayersSheet({
  visible,
  onClose,
  players,
  loading,
  error,
  onRefresh,
}: {
  visible: boolean;
  onClose: () => void;
  players: OnlinePlayerSummary[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <ModalSheet visible={visible} onClose={onClose} title="Players Online">
      <View className="ui-stack-3">
        {loading ? <Text variant="muted">Loading online players...</Text> : null}
        {error ? (
          <View className="ui-stack-2">
            <Text variant="danger">{error}</Text>
            <Button title="Retry" variant="ghost" onPress={onRefresh} />
          </View>
        ) : null}
        {!loading && !error && players.length === 0 ? <Text variant="muted">No players online</Text> : null}

        {!error ? (
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
            {players.map((player) => (
              <View key={player.userId} className="ui-row items-center ui-inline-3 rounded-lg border border-border-subtle bg-panel-elevated p-3">
                <View className="h-10 w-10 items-center justify-center rounded-full border border-border-subtle bg-panel">
                  <Text variant="label">{player.initials}</Text>
                </View>
                <View className="flex-1">
                  <Text variant="body">{player.displayName}</Text>
                  <Text variant="muted">{locationText(player.location)}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>
    </ModalSheet>
  );
}
