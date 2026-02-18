import { useState } from "react";
import { View, Pressable, ActivityIndicator } from "react-native";
import { Text } from "@/components/base/Text";
import { HandListItem } from "./HandListItem";

interface HandHistoryListItem {
  id: string;
  playedAt: Date;
  tableName: string;
  netResultCents: number;
  bigBlindCents: number;
  potCents: number;
  heroActionSummary?: string;
}

interface HandListProps {
  hands: HandHistoryListItem[];
  isLoading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  onHandPress: (handId: string) => void;
}

export function HandList({ 
  hands, 
  isLoading = false, 
  onLoadMore, 
  hasMore = false, 
  onHandPress 
}: HandListProps) {
  if (hands.length === 0 && !isLoading) {
    return (
      <View className="items-center py-8">
        <Text variant="muted" className="text-center">No hands found</Text>
        <Text variant="muted" className="text-center mt-2">
          Play some hands to see your history here
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <View className="p-4">
        {hands.map((hand) => (
          <HandListItem
            key={hand.id}
            hand={hand}
            onPress={onHandPress}
          />
        ))}
      </View>

      {/* Load More Button */}
      {hasMore && (
        <View className="p-4">
          <Pressable
            onPress={onLoadMore}
            disabled={isLoading}
            className="ui-surface p-3 rounded-lg items-center active:opacity-80 disabled:opacity-50"
          >
            {isLoading ? (
              <View className="ui-row items-center">
                <ActivityIndicator size="small" className="mr-2" />
                <Text variant="muted">Loading...</Text>
              </View>
            ) : (
              <Text variant="body">Load More</Text>
            )}
          </Pressable>
        </View>
      )}

      {/* End of list indicator */}
      {!hasMore && hands.length > 0 && (
        <View className="items-center py-4">
          <Text variant="muted" className="text-xs">End of hand history</Text>
        </View>
      )}
    </View>
  );
}
