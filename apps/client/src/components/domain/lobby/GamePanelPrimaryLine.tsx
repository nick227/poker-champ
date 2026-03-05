import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import { GAME_PANEL_LAYOUT } from "./gamePanel.layout";

export function GamePanelPrimaryLine({
  gameName,
  smallBlindCents,
  bigBlindCents,
}: {
  gameName: string;
  smallBlindCents: number;
  bigBlindCents: number;
}) {
  return (
    <View className="ui-col" style={{ minHeight: GAME_PANEL_LAYOUT.primaryLineMinHeight }}>
      <View className="flex-1">
        <Text variant="h1" className="text-[24px]">{gameName}</Text>
        <Text variant="h2" className="text-[14px] leading-tight tracking-tight">
          {formatCents(smallBlindCents)} / {formatCents(bigBlindCents)}
        </Text>
      </View>
    </View>
  );
}
