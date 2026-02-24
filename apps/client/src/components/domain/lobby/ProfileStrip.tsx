import { View } from "react-native";
import type { ReactNode } from "react";
import { Text } from "@/components/base/Text";

export function ProfileStrip({
  username,
  location,
  rightAction,
}: {
  username: string;
  location?: string;
  rightAction?: ReactNode;
}) {
  return (
    <View className="ui-section ui-row items-center justify-between ui-inline-3">
      <View className="ui-row items-center ui-inline-3 flex-1">
        <View className="h-10 w-10 rounded-full ui-surface ui-center border border-border-subtle">
          <Text numberOfLines={1} variant="body">{username.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View className="flex-1">
          <Text numberOfLines={1} variant="body">{username}</Text>
          {location ? <Text numberOfLines={1} variant="muted">{location}</Text> : null}
        </View>
      </View>
      {rightAction ? <View>{rightAction}</View> : null}
    </View>
  );
}
