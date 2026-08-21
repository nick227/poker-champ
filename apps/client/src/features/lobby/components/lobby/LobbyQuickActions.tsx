import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/base/Text";

type QuickAction = {
  label: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

type Props = {
  onCreateTournament: () => void;
  onQuickStart: () => void;
  onLeaderboard: () => void;
  onTraining: () => void;
};

export function LobbyQuickActions({
  onCreateTournament,
  onQuickStart,
  onLeaderboard,
  onTraining,
}: Props) {
  const actions: QuickAction[] = [
    {
      label: "New tournament",
      detail: "Create and host",
      icon: "trophy-outline",
      onPress: onCreateTournament,
    },
    {
      label: "Quick start",
      detail: "Play bots heads-up or 9-max",
      icon: "dice-outline",
      onPress: onQuickStart,
    },
    {
      label: "Poker training",
      detail: "Sharpen your strategy",
      icon: "book-outline",
      onPress: onTraining,
    },
    {
      label: "Leaderboard",
      detail: "See where you rank",
      icon: "bar-chart-outline",
      onPress: onLeaderboard,
    },
  ];

  return (
    <View className="flex-row flex-wrap gap-3 mb-4">
      {actions.map((action) => (
        <Pressable
          key={action.label}
          onPress={action.onPress}
          accessibilityRole="link"
          className="ui-row flex-1 min-w-[150px] min-h-[68px] gap-2 rounded-3 border border-border bg-panel px-2 py-3 border-t-2 border-t-brand hover:bg-panel-elevated"
          style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}
        >
          <View className="h-9 w-9 rounded-full border border-brand/70 bg-brand-soft/25 ui-center shrink-0">
            <Ionicons name={action.icon} size={17} color="hsl(158 52% 42%)" />
          </View>
          <View className="min-w-0 flex-1">
            <Text variant="body" className="text-[13px] font-semibold" numberOfLines={1}>
              {action.label}
            </Text>
            <Text variant="muted" className="text-[11px] mt-0.5" numberOfLines={1}>
              {action.detail}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
