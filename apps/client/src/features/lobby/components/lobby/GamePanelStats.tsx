import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import { GAME_PANEL_LAYOUT } from "./gamePanel.layout";

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
  const ratio = seats > 0 ? Math.min(1, players / seats) : 0;
  const barClass = ratio >= 0.75 ? "bg-danger" : ratio >= 0.34 ? "bg-warn" : "bg-success";
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
  const avgPotValue = avgPotCents && avgPotCents > 0 ? formatCents(avgPotCents) : "";
  const waitlistValue = waitlistCount && waitlistCount > 0 ? String(waitlistCount) : "";

  return (
    <View
      className="ui-row flex-wrap bg-panel rounded-md p-2"
      style={{ minHeight: GAME_PANEL_LAYOUT.statsMinHeight }}
    >
      <Stat label="Seats" value={`${players} / ${seats}`}>
        <OccupancyBar players={players} seats={seats} />
      </Stat>
      <Stat label="Buy-in" value={`${formatCents(minBuyInCents)} - ${formatCents(maxBuyInCents)}`} />
      {avgPotValue ? <Stat label="Avg Pot" value={avgPotValue} /> : null}
      {waitlistValue ? <Stat label="Waitlist" value={waitlistValue} /> : null}
    </View>
  );
}
