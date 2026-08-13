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
  surfaceClass,
  eyebrowClass,
  primary,
  primaryLabel,
  secondary,
  secondaryLabel,
  compact,
}: {
  eyebrow: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  surfaceClass: string;
  eyebrowClass: string;
  primary: number;
  primaryLabel: string;
  secondary: number;
  secondaryLabel: string;
  compact: boolean;
}) {
  return (
    <View className={`overflow-hidden rounded-2 border flex-1 ui-row ${surfaceClass}`}>
      <View className={`ui-center ${compact ? "w-9" : "w-14"} opacity-30`}>
        <Ionicons name={icon} size={compact ? 18 : 26} color={iconColor} />
      </View>
      <View className={`flex-1 justify-center ${compact ? "py-2 pr-3" : "py-3 pr-4"}`}>
        <Text variant="label" className={`font-display tracking-[0.14em] uppercase ${eyebrowClass}`}>
          {eyebrow}
        </Text>
        <View className="ui-row items-center mt-1.5">
          <Text variant="muted" className="flex-1 text-[12px]" numberOfLines={1}>
            <Text className="font-semibold tabular-nums text-text">{primary}</Text> {primaryLabel}
          </Text>
          <View className="w-px self-stretch bg-border/70 mx-3" />
          <Text variant="muted" className="flex-1 text-[12px]" numberOfLines={1}>
            <Text className="font-semibold tabular-nums text-text">{secondary}</Text> {secondaryLabel}
          </Text>
        </View>
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
        surfaceClass="border-brand/20 bg-brand-soft/40"
        eyebrowClass="text-brand"
        primary={tablesLive}
        primaryLabel={tablesLive === 1 ? "Table Live" : "Tables Live"}
        secondary={seatsAvailable}
        secondaryLabel="Seats Available"
        compact={compact}
      />
      <SummaryCard
        eyebrow="Tournaments"
        icon="trophy"
        iconColor="hsl(42 82% 50%)"
        surfaceClass="border-gold/20 bg-gold-soft/25"
        eyebrowClass="text-gold"
        primary={upcomingEvents}
        primaryLabel={upcomingEvents === 1 ? "Upcoming Event" : "Upcoming Events"}
        secondary={playersRegistered}
        secondaryLabel="Players Registered"
        compact={compact}
      />
    </View>
  );
}
