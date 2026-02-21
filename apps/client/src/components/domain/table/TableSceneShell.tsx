import type { ReactNode } from "react";
import { Platform, View } from "react-native";
import { vars } from "nativewind";
import { TableLayoutHeightProvider } from "./TableLayoutHeightContext";
import { Text } from "@/components/base/Text";
import { TableTopBar } from "./TableTopBar";
import { OpponentStrip, type Opponent } from "./OpponentStrip";
import { formatCents } from "@/lib/format";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useTableLayoutHeights } from "./hooks/useTableLayoutHeights";
import { layoutStyles } from "./tableLayout.styles";
import { ACTION_BAR_HEIGHT } from "./constants/tableLayout.constants";
import { useProfile } from "@/hooks/useProfile";

type Blinds = { smallBlindCents: number; bigBlindCents: number };

export type TableSceneShellProps = {
  tableName: string;
  blinds?: Blinds;
  playerCount: number;
  maxSeats: number;
  balanceCents: number;
  topBarLeft?: ReactNode;
  topBarRight?: ReactNode;
  opponents: Opponent[];
  winnerName?: string;
  onPlayerPress?: (opponent: Opponent) => void;
  dealerBar: ReactNode;
  board: ReactNode;
  hero: ReactNode;
  bottom: ReactNode;
  rootClassName?: string;
  titleSectionClassName?: string;
  topBarSectionClassName?: string;
};

function cx(...tokens: Array<string | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

export function TableSceneShell({
  tableName,
  blinds,
  playerCount,
  maxSeats,
  balanceCents,
  topBarLeft,
  topBarRight,
  opponents,
  winnerName,
  onPlayerPress,
  dealerBar,
  board,
  hero,
  bottom,
  rootClassName,
  titleSectionClassName,
  topBarSectionClassName,
}: TableSceneShellProps) {
  const { feltColor, cardFaceColor, cardBackColor, accentColor, backgroundColor, tableRadius } =
    usePreferencesStore();
  const { insets, opponentStripHeight, heroZoneHeight } = useTableLayoutHeights();
  const profile = useProfile();

  const opponentStripStyle =
    Platform.OS === "web"
      ? { height: "var(--table-opponent-strip-height)" as unknown as number }
      : { height: opponentStripHeight, minHeight: opponentStripHeight };
  const heroSectionStyle =
    Platform.OS === "web"
      ? { height: "var(--table-hero-zone-height)" as unknown as number }
      : { height: heroZoneHeight, minHeight: heroZoneHeight };

  return (
    <View
      collapsable={false}
      style={[
        vars({
          "--c-felt": feltColor,
          "--c-card-face": cardFaceColor,
          "--c-card-back": cardBackColor,
          "--c-gold": accentColor,
          "--c-brand": accentColor,
          "--c-bg": backgroundColor,
          "--r-table": tableRadius,
          "--table-opponent-strip-height": `${opponentStripHeight}px`,
          "--table-hero-zone-height": `${heroZoneHeight}px`,
        }),
        layoutStyles.root,
        { paddingTop: insets.top },
      ]}
      className={cx("table-wrapper", rootClassName)}
    >
      <TableLayoutHeightProvider heroZoneHeight={heroZoneHeight}>
      <View
        collapsable={false}
        style={layoutStyles.titleSection}
        className={cx("ui-stack-1 justify-center", titleSectionClassName)}
      >
        <Text style={{ fontSize: 24, textAlign: "center" }} variant="h1" numberOfLines={1} ellipsizeMode="tail" allowFontScaling={false}>
          {tableName}
        </Text>
        <View className="ui-row ui-center gap-x-3">
          {blinds && (
            <Text variant="label" className="text-text-subtle" allowFontScaling={false}>
              {formatCents(blinds.smallBlindCents)} / {formatCents(blinds.bigBlindCents)}
            </Text>
          )}
          <Text variant="label" className="text-text-subtle" allowFontScaling={false}>
            {playerCount} / {maxSeats} players
          </Text>
        </View>
      </View>

      <View
        collapsable={false}
        style={layoutStyles.topBarSection}
        className={cx(topBarSectionClassName)}
      >
        <TableTopBar userName={profile.username} balanceCents={balanceCents} left={topBarLeft} right={topBarRight} />
      </View>

      <View
        collapsable={false}
        style={[layoutStyles.opponentStripSection, opponentStripStyle]}
        className="table-opponent-strip"
      >
        <OpponentStrip
          opponents={opponents}
          winnerName={winnerName}
          onPlayerPress={onPlayerPress}
          height={opponentStripHeight}
        />
      </View>

      <View collapsable={false}>
        <View collapsable={false} style={layoutStyles.gameArea}>
          <View collapsable={false} style={layoutStyles.dealerBar}>
            {dealerBar}
          </View>
          <View collapsable={false} style={layoutStyles.feltArea}>
            {board}
          </View>
        </View>
        <View
          collapsable={false}
          style={[layoutStyles.heroSection, heroSectionStyle]}
          className="table-hero-section"
        >
          {hero}
        </View>
      </View>

      <View
        collapsable={false}
        style={[
          layoutStyles.actionBarSection,
          {
            height: ACTION_BAR_HEIGHT + insets.bottom,
            minHeight: ACTION_BAR_HEIGHT + insets.bottom,
            paddingBottom: insets.bottom,
          },
        ]}
        className="border-t border-border-subtle"
      >
        {bottom}
      </View>
      </TableLayoutHeightProvider>
    </View>
  );
}
