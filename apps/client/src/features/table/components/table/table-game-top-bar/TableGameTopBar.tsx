import type { ReactNode } from "react";
import { View } from "react-native";
import { IconButton } from "@/components/base/IconButton";
import { Text } from "@/components/base/Text";
import { Icon } from "@/components/base/Icons";
import { formatCents } from "@/lib/format";
import { Surface } from "@/components/containers/Surface";
import { tableGameTopBarStyles } from "./styles";
import { APP_NAME } from "@/constants/copy";
import { HUD_TOPBAR_BG } from "../tokens/hud.tokens";

const SUIT_ACCENT = "♠";

export type TableGameTopBarProps = {
  tableName: string;
  smallBlindCents?: number;
  bigBlindCents?: number;
  minBuyInCents?: number;
  onLogoPress: () => void;
  right?: ReactNode;
};

/**
 * Dense, GGPoker-style info line: "Blinds $1 | $2  ·  Min $100". `smallBlindCents`/`bigBlindCents`/
 * `minBuyInCents` are the only per-table figures currently plumbed into this component — hand
 * number, blinds level/timer, prize, and rank shown in the reference art are not available on
 * this props surface (or in TableSceneShell's callsite) and are intentionally not fabricated here.
 */
function formatBlindsLine(smallBlindCents?: number, bigBlindCents?: number, minBuyInCents?: number): string | null {
  const hasBlinds = smallBlindCents != null && bigBlindCents != null && smallBlindCents > 0 && bigBlindCents > 0;
  const hasMin = minBuyInCents != null && minBuyInCents > 0;
  if (!hasBlinds && !hasMin) return null;
  const blinds = hasBlinds ? `Blinds ${formatCents(smallBlindCents)} | ${formatCents(bigBlindCents)}` : "";
  const min = hasMin ? `Min ${formatCents(minBuyInCents)}` : "";
  return [blinds, min].filter(Boolean).join("  ·  ");
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
    // Plain View wrapper (not Surface) carries the elevation shadow that separates the HUD
    // band from the felt below — Surface className is layout-only per lint guardrail, so
    // visual chrome (shadow/gradient) lives on wrappers around it instead.
    <View collapsable={false} className="shadow-md">
      <Surface styleId="surface.sim.table.topbar">
        <View
          pointerEvents="none"
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: HUD_TOPBAR_BG }}
        />
        <View className="ui-row items-center ui-inline-2 flex-1 items-start">
          <View className="flex-col items-center align-start">
            <IconButton
              intent="neutral"
              size="sm"
              icon={<Icon name="logo" size={18} />}
              onPress={onLogoPress}
            />
          </View>
          <Text
            variant="caption"
            className="text-muted font-semibold"
            allowFontScaling={false}
          >
            {APP_NAME}
          </Text>
          <View className="flex-1 items-end justify-center">
            <View className="ui-row items-center ui-inline-1">
              <Text allowFontScaling={false} className="text-gold text-xs">
                {SUIT_ACCENT}
              </Text>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                allowFontScaling={false}
                style={tableGameTopBarStyles.gameTopBarTableName}
                className="text-text font-bold"
              >
                {tableName}
              </Text>
            </View>
            {subtitle ? (
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                ellipsizeMode="tail"
                className="text-gold font-semibold text-[11px] tracking-wide"
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        <View className="items-end justify-center">{right}</View>
      </Surface>
    </View>
  );
}
