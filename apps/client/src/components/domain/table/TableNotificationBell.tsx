import { Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import { Icon } from "@/components/base/Icons";

export function TableNotificationBell({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="ui-touch ui-surface"
    >
      <Icon name="bell" size={20} />
      {count > 0 && (
        <View className="absolute -right-1 -top-1 min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1">
          <Text variant="body" className="text-xs text-text">
            {count > 99 ? "99+" : count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
