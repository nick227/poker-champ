import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/base/Text";

type Props = {
  tablesLive: number;
  seatsAvailable: number;
  upcomingEvents: number;
  playersRegistered: number;
  compact?: boolean;
};

function SummaryCard({
  eyebrow,
  icon,
  iconColor,
  iconSurfaceClass,
  primary,
  primaryLabel,
  secondary,
  secondaryLabel,
  compact,
}: {
  eyebrow: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconSurfaceClass: string;
  primary: number;
  primaryLabel: string;
  secondary: number;
  secondaryLabel: string;
  compact: boolean;
}) {
  return (
    <View className="overflow-hidden rounded-3 border border-border bg-panel flex-1 px-4 py-4">
      <View className="ui-row gap-2">
        <View className={`h-7 w-7 rounded-full ui-center ${iconSurfaceClass}`}>
          <Ionicons name={icon} size={14} color={iconColor} />
        </View>
        <Text variant="label" className="tracking-[0.12em] uppercase font-semibold">
          {eyebrow}
        </Text>
      </View>
        <View className={`${compact ? "mt-2 gap-1" : "ui-row items-center mt-3"}`}>
          <Text variant="muted" className={`text-[12px] ${compact ? "" : "flex-1"}`} numberOfLines={1}>
            <Text className="font-semibold tabular-nums text-text">{primary}</Text> {primaryLabel}
          </Text>
          {compact ? null : <View className="h-1 w-1 rotate-45 bg-muted/50 mx-4" />}
          <Text variant="muted" className={`text-[12px] ${compact ? "" : "flex-1"}`} numberOfLines={1}>
            <Text className="font-semibold tabular-nums text-text">{secondary}</Text> {secondaryLabel}
          </Text>
        </View>
    </View>
  );
}

export function LobbySummaryCards({
  tablesLive,
  seatsAvailable,
  upcomingEvents,
  playersRegistered,
  compact = false,
}: Props) {
  return (
    <View className={compact ? "flex-col gap-2" : "ui-row items-stretch gap-3"}>
      <SummaryCard
        eyebrow="Cash games"
        icon="ellipse"
        iconColor="hsl(158 52% 42%)"
        iconSurfaceClass="border border-brand/60 bg-brand-soft/30"
        primary={tablesLive}
        primaryLabel={
          compact
            ? tablesLive === 1
              ? "Live table"
              : "Live tables"
            : tablesLive === 1
              ? "Table Live"
              : "Tables Live"
        }
        secondary={seatsAvailable}
        secondaryLabel={compact ? "Open seats" : "Seats Available"}
        compact={compact}
      />
      <SummaryCard
        eyebrow="Tournaments"
        icon="trophy"
        iconColor="hsl(42 82% 50%)"
        iconSurfaceClass="border border-gold/50 bg-gold-soft/15"
        primary={upcomingEvents}
        primaryLabel={
          compact
            ? "Upcoming"
            : upcomingEvents === 1
              ? "Upcoming Event"
              : "Upcoming Events"
        }
        secondary={playersRegistered}
        secondaryLabel={compact ? "Registered" : "Players Registered"}
        compact={compact}
      />
    </View>
  );
}
