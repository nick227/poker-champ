import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { TABLE } from "@/constants/copy";

export type RejoinUiState = "idle" | "sending" | "error";

type RejoinCTAProps = {
  state: RejoinUiState;
  errorMessage?: string | null;
  onPressRejoin: () => void;
  onBackToLobby?: () => void;
  isFatalTableGone?: boolean;
};

export function RejoinCTA({
  state,
  errorMessage,
  onPressRejoin,
  onBackToLobby,
  isFatalTableGone = false,
}: RejoinCTAProps) {
  return (
    <View className="ui-p-inline-4 gap-y-2 items-center">
      <Text className="text-center text-muted bg-panel rounded-sm px-4" numberOfLines={2}>
        You're sitting out.
      </Text>
      {state === "error" && errorMessage ? (
        <Text className="text-center text-danger bg-panel rounded-sm px-4" numberOfLines={2}>
          {errorMessage}
        </Text>
      ) : null}
      <Button title={state === "sending" ? "Rejoining..." : TABLE.rejoin} onPress={onPressRejoin} disabled={state === "sending"} />
      {state === "error" && isFatalTableGone && onBackToLobby ? (
        <Button title="Back to lobby" onPress={onBackToLobby} variant="ghost" />
      ) : null}
    </View>
  );
}

