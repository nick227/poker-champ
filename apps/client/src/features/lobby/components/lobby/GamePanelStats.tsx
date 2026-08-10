import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import { GAME_PANEL_LAYOUT } from "./gamePanel.layout";
import { OCCUPANCY_BAR_CLASS, resolveOccupancyTone } from "./gamePanelPresentation";

function Stat({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: ReactNode;
}) {
  return (
    <View className="w-1/2 lg:w-1/4 pr-2 min-h-[30px] justify-center">
      <Text variant="label" className="text-[10px]">{label}</Text>
      <Text variant="body" className="text-[13px] font-medium" numberOfLines={1}>{value}</Text>
      {children}
    </View>
  );
}

function OccupancyBar({ players, seats }: { players: number; seats: number }) {
  const tone = resolveOccupancyTone(players, seats);
  const ratio = seats > 0 ? Math.min(1, players / seats) : 0;
  const barClass = OCCUPANCY_BAR_CLASS[tone];
  return (
    <View className="mt-1 h-1 w-full max-w-[72px] rounded-full bg-border-subtle overflow-hidden">
      <View className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.max(6, ratio * 100)}%` }} />
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
  const avgPotValue = avgPotCents && avgPotCents > 0 ? formatCents(avgPotCents) : null;
  const waitlistValue = waitlistCount && waitlistCount > 0 ? String(waitlistCount) : null;

  // Only render the occupancy bar inline — unique stats (avg pot, waitlist) shown if present.
  // Seats and Buy-in are not repeated here (already in GamePanelPrimaryLine).
  return (
    <View
      className="ui-row flex-wrap bg-panel rounded-md p-2 items-center"
      style={{ minHeight: GAME_PANEL_LAYOUT.statsMinHeight }}
    >
      <View className="w-1/2 pr-2 justify-center min-h-[30px]">
        <Text variant="label" className="text-[10px]">{`${players} / ${seats} seats`}</Text>
        <OccupancyBar players={players} seats={seats} />
      </View>
      {avgPotValue ? <Stat label="Avg Pot" value={avgPotValue} /> : null}
      {waitlistValue ? <Stat label="Waitlist" value={waitlistValue} /> : null}
    </View>
  );
}

