import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import { GAME_PANEL_LAYOUT } from "./gamePanel.layout";

function Stat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View className="w-1/2 pr-2 min-h-[28px] justify-center">
      <Text variant="label" className="text-[10px]">{label}</Text>
      <Text variant="body" className="text-[13px]" numberOfLines={1}>{value}</Text>
    </View>
  );
}

export function GamePanelStats({
  players,
  seats,
  minBuyInCents,
  maxBuyInCents,
  avgPotCents,
  waitlistCount,
}: {
  players: number;
  seats: number;
  minBuyInCents: number;
  maxBuyInCents: number;
  avgPotCents?: number;
  waitlistCount?: number;
}) {
  const avgPotValue = avgPotCents && avgPotCents > 0 ? formatCents(avgPotCents) : "";
  const waitlistValue = waitlistCount && waitlistCount > 0 ? String(waitlistCount) : "";

  return (
    <View className="ui-row flex-wrap" style={{ minHeight: GAME_PANEL_LAYOUT.statsMinHeight }}>
      <Stat label="Seats" value={`${players} / ${seats}`} />
      <Stat label="Buy-in" value={`${formatCents(minBuyInCents)} - ${formatCents(maxBuyInCents)}`} />
      <Stat label="Avg Pot" value={avgPotValue} />
      <Stat label="Waitlist" value={waitlistValue} />
    </View>
  );
}
