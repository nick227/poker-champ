import type { ReactNode } from "react";
import { View } from "react-native";
import { IconButton } from "@/components/base/IconButton";
import { Text } from "@/components/base/Text";
import { Icon } from "@/components/base/Icons";
import { formatCents } from "@/lib/format";
import { Surface } from "@/components/containers/Surface";
import { tableGameTopBarStyles } from "./styles";
import { APP_NAME } from "@/constants/copy";

const LOGO_MARK = "♠";

export type TableGameTopBarProps = {
  tableName: string;
  smallBlindCents?: number;
  bigBlindCents?: number;
  minBuyInCents?: number;
  onLogoPress: () => void;
  right?: ReactNode;
};

function formatBlindsLine(smallBlindCents?: number, bigBlindCents?: number, minBuyInCents?: number): string | null {
  const hasBlinds = smallBlindCents != null && bigBlindCents != null && smallBlindCents > 0 && bigBlindCents > 0;
  const hasMin = minBuyInCents != null && minBuyInCents > 0;
  if (!hasBlinds && !hasMin) return null;
  const blinds = hasBlinds ? `${formatCents(smallBlindCents)} / ${formatCents(bigBlindCents)}` : "";
  const min = hasMin ? `Min ${formatCents(minBuyInCents)}` : "";
  return [blinds, min].filter(Boolean).join(" · ");
}

export function TableGameTopBar({
  tableName,
  smallBlindCents,
  bigBlindCents,
  minBuyInCents,
  onLogoPress,
  right,
}: TableGameTopBarProps) {
  const subtitle = formatBlindsLine(smallBlindCents, bigBlindCents, minBuyInCents);

  return (
    <Surface styleId="surface.sim.table.topbar">
      <View className="ui-row items-center ui-inline-3 flex-1 items-start">
        <View className="flex-col items-center align-start">
          <IconButton
            intent="neutral"
            size="sm"
            icon={<Icon name="logo" size={18} />}
            onPress={onLogoPress}
          />
        </View>
        <Text variant="h1">{APP_NAME}</Text>
        <View className="flex-1 items-end justify-center">
          <Text
            variant="body"
            numberOfLines={1}
            ellipsizeMode="tail"
            allowFontScaling={false}
            style={tableGameTopBarStyles.gameTopBarTableName}
          >
            {tableName}
          </Text>
          {subtitle ? (
            <Text variant="label" className="text-text-subtle" numberOfLines={1} ellipsizeMode="tail" allowFontScaling={false}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <View className="items-end justify-center">{right}</View>
    </Surface>
  );
}
