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

function StatPair({
  primary,
  primaryLabel,
  secondary,
  secondaryLabel,
}: {
  primary: number;
  primaryLabel: string;
  secondary: number;
  secondaryLabel: string;
}) {
  return (
    <View className="ui-row items-center mt-2">
      <Text variant="body" className="flex-1 text-[13px]" numberOfLines={2}>
        <Text className="font-semibold tabular-nums">{primary}</Text> {primaryLabel}
      </Text>
      <View className="w-px self-stretch bg-border/80 mx-3" />
      <Text variant="body" className="flex-1 text-[13px]" numberOfLines={2}>
        <Text className="font-semibold tabular-nums">{secondary}</Text> {secondaryLabel}
      </Text>
    </View>
  );
}

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
    <View className={`overflow-hidden rounded-3 border flex-1 ui-row ${surfaceClass}`}>
      <View className={`ui-center ${compact ? "w-12" : "w-[92px]"} opacity-35`}>
        <Ionicons name={icon} size={compact ? 28 : 56} color={iconColor} />
      </View>
      <View className={`flex-1 justify-center ${compact ? "py-3 pr-3" : "min-h-[120px] py-4 pr-5"}`}>
        <Text variant="label" className={`font-display tracking-[0.16em] uppercase ${eyebrowClass}`}>
          {eyebrow}
        </Text>
        <StatPair
          primary={primary}
          primaryLabel={primaryLabel}
          secondary={secondary}
          secondaryLabel={secondaryLabel}
        />
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
    <View className="ui-row items-stretch gap-4">
      <SummaryCard
        eyebrow="Cash games"
        icon="ellipse"
        iconColor="hsl(158 52% 42%)"
        surfaceClass="border-brand/30 bg-brand-soft/80"
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
        surfaceClass="border-gold/30 bg-gold-soft/40"
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
