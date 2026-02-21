import { Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { useRouter } from "expo-router";
import type { HandHistoryListItem } from "@/services/history.service";

interface HandListItemProps {
  hand: HandHistoryListItem;
  onPress: (handId: string) => void;
}

export function HandListItem({ hand, onPress }: HandListItemProps) {
  const router = useRouter();
  
  const formatCents = (cents: number) => {
    return (cents / 100).toFixed(2);
  };

  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return `${diffDays}d ago`;
    } else if (diffHours > 0) {
      return `${diffHours}h ago`;
    } else {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return diffMins > 0 ? `${diffMins}m ago` : "Just now";
    }
  };

  const isWin = hand.netResultCents > 0;
  const resultColor = isWin ? "text-green-500" : "text-red-500";
  const resultPrefix = isWin ? "+" : "";
  const resultBadge = isWin ? "Won" : "Lost";

  const hasReplay = hand.hasReplay === true;
  const onReplayPress = () => {
    if (!hasReplay) return;
    router.push(`/replay/${hand.id}`);
  };

  return (
    <Pressable
      onPress={() => onPress(hand.id)}
      className="ui-surface p-4 mb-2 rounded-lg active:opacity-80"
    >
      <View className="ui-row justify-between items-start mb-2">
        <View className="flex-1">
          <View className="ui-row items-center mb-1">
            <Text variant="body" className="font-semibold">{hand.tableName}</Text>
            <View className={`ml-2 px-2 py-1 rounded ${isWin ? "bg-green-500/20" : "bg-red-500/20"}`}>
              <Text variant="muted" className={`text-xs ${isWin ? "text-green-600" : "text-red-600"}`}>
                {resultBadge}
              </Text>
            </View>
            {!hasReplay && (
              <View className="ml-2 px-2 py-1 rounded bg-muted/30">
                <Text variant="muted" className="text-xs">No replay</Text>
              </View>
            )}
          </View>
          <Text variant="muted" className="text-xs">{formatRelativeTime(hand.playedAt)}</Text>
          {hand.heroActionSummary && (
            <Text variant="muted" className="text-xs mt-1">{hand.heroActionSummary}</Text>
          )}
        </View>
        
        <View className="items-end">
          <Text variant="body" className={`font-semibold ${resultColor}`}>
            {resultPrefix}${formatCents(hand.netResultCents)}
          </Text>
          <Text variant="muted" className="text-xs">
            Pot: ${formatCents(hand.heroWonCents)}
          </Text>
          <Text variant="muted" className="text-xs">
            BB: {formatCents(hand.bigBlindCents)}
          </Text>
        </View>
      </View>
      
      {hasReplay && (
        <View className="mt-3">
          <Button title="Replay Hand" onPress={onReplayPress} variant="ghost" />
        </View>
      )}
    </Pressable>
  );
}
