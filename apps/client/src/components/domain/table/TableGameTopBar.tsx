import type { ReactNode } from "react";
import { View } from "react-native";
import { IconButton } from "@/components/base/IconButton";
import { Text } from "@/components/base/Text";
import { Icon } from "@/components/base/Icons";
import { formatCents } from "@/lib/format";
import { tableChromeStyles } from "./tableChrome.styles";
import { Surface } from "@/components/containers/Surface";

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
    <Surface styleId="surface.sim.table.topbar">
      <View className="ui-row items-center ui-inline-3 flex-1">
        <IconButton
          intent="neutral"
          size="md"
          icon={<Icon name="logo" size={18} />}
          onPress={onLogoPress}
        />
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
    </Surface>
  );
}
