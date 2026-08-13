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
  icon,
  iconColor,
  surfaceClass,
  primary,
  primaryLabel,
  secondary,
  secondaryLabel,
  compact,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  surfaceClass: string;
  primary: number;
  primaryLabel: string;
  secondary: number;
  secondaryLabel: string;
  compact: boolean;
}) {
  return (
    <View
      className={`relative overflow-hidden rounded-3 border ${surfaceClass} ${
        compact ? "flex-1 px-3 py-3" : "flex-1 min-h-[132px] px-5 py-4"
      }`}
    >
      {!compact ? (
        <View className="absolute right-3 top-2 opacity-20">
          <Ionicons name={icon} size={88} color={iconColor} />
        </View>
      ) : (
        <Ionicons name={icon} size={18} color={iconColor} />
      )}
      <View className={`ui-row items-end flex-wrap ${compact ? "mt-2 gap-4" : "mt-1 gap-8"}`}>
        <View>
          <Text variant="h1" className={`${compact ? "text-2xl" : "text-[32px]"} font-semibold tabular-nums`}>
            {primary}
          </Text>
          <Text variant="muted" className="text-[12px] mt-0.5">
            {primaryLabel}
          </Text>
        </View>
        <View>
          <Text variant="h2" className={`${compact ? "text-xl" : "text-[24px]"} font-semibold tabular-nums`}>
            {secondary}
          </Text>
          <Text variant="muted" className="text-[12px] mt-0.5">
            {secondaryLabel}
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
    <View className={`ui-row items-stretch gap-3 ${compact ? "" : "gap-4"}`}>
      <SummaryCard
        icon="ellipse-outline"
        iconColor="hsl(158 52% 42%)"
        surfaceClass="border-brand/30 bg-brand-soft/80"
        primary={tablesLive}
        primaryLabel={tablesLive === 1 ? "Table live" : "Tables live"}
        secondary={seatsAvailable}
        secondaryLabel="Seats available"
        compact={compact}
      />
      <SummaryCard
        icon="trophy-outline"
        iconColor="hsl(42 82% 50%)"
        surfaceClass="border-gold/30 bg-gold-soft/40"
        primary={upcomingEvents}
        primaryLabel={upcomingEvents === 1 ? "Upcoming event" : "Upcoming events"}
        secondary={playersRegistered}
        secondaryLabel="Players registered"
        compact={compact}
      />
    </View>
  );
}
