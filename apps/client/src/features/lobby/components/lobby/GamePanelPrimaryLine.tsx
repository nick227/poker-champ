import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import { GAME_PANEL_LAYOUT } from "./gamePanel.layout";
import {
  formatSeatsTag,
  resolveStakesTier,
  resolveTableStatus,
  STAKES_TIER_BG_CLASS,
  type TableStatusTone,
} from "./gamePanelPresentation";

const STATUS_TEXT_CLASS: Record<TableStatusTone, string> = {
  success: "text-success",
  warn: "text-warn",
  danger: "text-danger",
};

const STATUS_BORDER_CLASS: Record<TableStatusTone, string> = {
  success: "border-success/40 bg-success/10",
  warn: "border-warn/40 bg-warn/10",
  danger: "border-danger/40 bg-danger/10",
};

function StatusPill({ label, tone }: { label: string; tone: TableStatusTone }) {
  return (
    <View className={`rounded-full border px-2 py-0.5 ${STATUS_BORDER_CLASS[tone]}`}>
      <Text
        variant="label"
        className={`text-[10px] tracking-wide ${STATUS_TEXT_CLASS[tone]}`}
        allowFontScaling={false}
      >
        {label}
      </Text>
    </View>
  );
}

export function GamePanelPrimaryLine({
  gameName,
  smallBlindCents,
  bigBlindCents,
  minBuyInCents,
  players,
  seats,
}: {
  gameName: string;
  smallBlindCents: number;
  bigBlindCents: number;
  minBuyInCents: number;
  players: number;
  seats: number;
}) {
  const status = resolveTableStatus(players, seats);
  const tier = resolveStakesTier(minBuyInCents);

  return (
    <View className="ui-col gap-1" style={{ minHeight: GAME_PANEL_LAYOUT.primaryLineMinHeight }}>
      <View className="ui-row items-center justify-between gap-2">
        <Text variant="h1" className="text-[20px] flex-1 lg:text-[22px]" numberOfLines={1}>
          {gameName}
        </Text>
        <StatusPill label={status.label} tone={status.tone} />
      </View>
      <View className="ui-row items-center gap-2">
        <View className={`h-3 w-1 rounded-full ${STAKES_TIER_BG_CLASS[tier]}`} />
        <Text
          variant="h2"
          className="text-[17px] font-bold leading-tight tracking-tight"
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {formatCents(smallBlindCents)} / {formatCents(bigBlindCents)}
        </Text>
        <View className="h-1 w-1 rounded-full bg-border" />
        <Text variant="label" className="text-[10px]" allowFontScaling={false}>
          {formatSeatsTag(seats)}
        </Text>
        <View className="h-1 w-1 rounded-full bg-border" />
        <Text variant="label" className="text-[10px]" allowFontScaling={false}>
          Cash
        </Text>
      </View>
    </View>
  );
}
