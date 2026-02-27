import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { ConfirmButton } from "@/components/base/ConfirmButton";
import { formatCents } from "@/lib/format";
import { GAME_PANEL_LAYOUT } from "./gamePanel.layout";

export function GamePanelPrimaryLine({
  gameName,
  smallBlindCents,
  bigBlindCents,
  canJoin,
  onJoin,
  isJoining,
}: {
  gameName: string;
  smallBlindCents: number;
  bigBlindCents: number;
  canJoin?: boolean;
  onJoin?: () => void;
  isJoining?: boolean;
}) {
  return (
    <View className="ui-row items-center justify-between" style={{ minHeight: GAME_PANEL_LAYOUT.primaryLineMinHeight }}>
      <View className="ui-stack-1 justify-center flex-1">
        <Text variant="h2" className="text-[15px]" numberOfLines={1}>{gameName}</Text>
        <Text variant="h1" className="text-[28px] leading-tight tracking-tight">
          {formatCents(smallBlindCents)} / {formatCents(bigBlindCents)}
        </Text>
      </View>
      {canJoin !== undefined && onJoin && (
        <View className="w-[120px]">
          <ConfirmButton title={isJoining ? "Joining..." : "Join Table"} onPress={onJoin} disabled={!canJoin || isJoining} />
        </View>
      )}
    </View>
  );
}
