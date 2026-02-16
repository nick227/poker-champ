import { Pressable, View } from "react-native";
import type { ReactNode } from "react";
import { Text } from "@/components/base/Text";

export function ListItem({ title, subtitle, right, onPress }: { title: string; subtitle?: string; right?: ReactNode; onPress?: () => void }) {
  const Body = (
    <View className="ui-row justify-between ui-surface ui-p-4">
      <View className="gap-1">
        <Text variant="body">{title}</Text>
        {subtitle ? <Text variant="muted">{subtitle}</Text> : null}
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
  if (!onPress) return Body;
  return <Pressable onPress={onPress}>{Body}</Pressable>;
}
