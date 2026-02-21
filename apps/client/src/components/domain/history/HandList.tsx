import { View, Pressable, ActivityIndicator, FlatList } from "react-native";
import { Text } from "@/components/base/Text";
import { HandListItem } from "./HandListItem";
import type { HandHistoryListItem } from "@/services/history.service";

interface HandListProps {
  hands: HandHistoryListItem[];
  isLoading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  onHandPress: (handId: string) => void;
  error?: string | null;
}

export function HandList({
  hands,
  isLoading = false,
  onLoadMore,
  hasMore = false,
  onHandPress,
  error = null,
}: HandListProps) {

  if (hands.length === 0 && !isLoading) {
    return (
      <View className="flex-1 items-center justify-center px-4">
        {error ? (
          <Text variant="muted" className="text-center">{error}</Text>
        ) : (
          <>
            <Text variant="muted" className="text-center">No hands found</Text>
            <Text variant="muted" className="text-center mt-2">
              Play some hands to see your history here
            </Text>
          </>
        )}
      </View>
    );
  }

  return (
    <FlatList
      data={hands}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <HandListItem
          hand={item}
          onPress={onHandPress}
        />
      )}

      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 96 }}

      onEndReached={hasMore ? onLoadMore : undefined}
      onEndReachedThreshold={0.6}

      ListFooterComponent={
        isLoading ? (
          <View className="py-6 items-center">
            <ActivityIndicator />
          </View>
        ) : !hasMore ? (
          <View className="py-4 items-center">
            <Text variant="muted" className="text-xs">
              End of hand history
            </Text>
          </View>
        ) : null
      }
    />
  );
}