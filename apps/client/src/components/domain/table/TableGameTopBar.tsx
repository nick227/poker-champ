import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import { Icon } from "@/components/base/Icons";
import { formatCents } from "@/lib/format";
import { tableChromeStyles } from "./tableChrome.styles";

export type TableGameTopBarProps = {
  tableName: string;
  userName?: string;
  stackCents: number;
  onLogoPress: () => void;
  right?: ReactNode;
};

export function TableGameTopBar({
  tableName,
  userName,
  stackCents,
  onLogoPress,
  right,
}: TableGameTopBarProps) {
  const displayName = userName?.trim() || "Player";

  return (
    <View className="mb-2 ui-row items-center justify-between ui-inline-3">
      <View className="ui-row items-center ui-inline-3 flex-1">
        <Pressable
          onPress={onLogoPress}
          className="h-10 w-10 rounded-full ui-surface ui-center border border-border-subtle"
        >
          <Icon name="logo" size={18} />
        </Pressable>
        <View className="flex-1">
          <Text
            variant="body"
            numberOfLines={1}
            ellipsizeMode="tail"
            allowFontScaling={false}
            style={tableChromeStyles.gameTopBarTableName}
          >
            {tableName}
          </Text>
          <Text variant="label" className="text-text-subtle" numberOfLines={1} ellipsizeMode="tail" allowFontScaling={false}>
            {displayName} - {formatCents(stackCents)}
          </Text>
        </View>
      </View>
      <View className="items-end justify-center">{right}</View>
    </View>
  );
}
