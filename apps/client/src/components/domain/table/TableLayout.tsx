import { useState, type ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { vars } from "nativewind";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { Text } from "@/components/base/Text";
import { TableTopBar } from "./TableTopBar";
import { OpponentStrip, type Opponent } from "./OpponentStrip";
import { DealerAnnounceBar } from "./DealerAnnounceBar";
import { CommunityBoard } from "./CommunityBoard";
import { HeroZone } from "./HeroZone";
import { ActionBar, type ActionBarOnAction } from "./ActionBar";
import { usePreferencesStore } from "@/stores/preferences.store";
import { Icon } from "@/components/base/Icons";
import { IconButton } from "@/components/base/IconButton";
import { ThemePickerSheet } from "./ThemePickerSheet";
import { formatCents } from "@/lib/format";
import {
  getHeroStatus,
  getIsMyTurn,
  getCommunityCards,
  getHeroCards,
  getHeroStackCents,
  getPotCents,
  getIsDealer,
} from "./table.adapter";
import {
  LAYOUT_TITLE_HEIGHT,
  LAYOUT_TOP_BAR_HEIGHT,
  GAME_AREA_HEIGHT,
  OPPONENT_STRIP_HEIGHT,
  OPPONENT_STRIP_HEIGHT_FALLBACK,
  HERO_ZONE_HEIGHT,
  HERO_ZONE_HEIGHT_FALLBACK,
  ACTION_BAR_HEIGHT,
  TOTAL_FIXED_HEIGHT,
} from "./constants/layoutHeights";

export type { Opponent };

export type HandResultMessage = { winnerName: string; amountCents: number; winningHandDescr?: string };

export type TableLayoutProps = {
  snapshot: TableSnapshotPayload;
  opponents: Opponent[];
  balanceCents: number;
  tableStatus?: string;
  connectionStatus?: "CONNECTED" | "RECONNECTING" | "DISCONNECTED";
  actionMessage?: string;
  handResultMessage?: HandResultMessage;
  topBarLeft?: ReactNode;
  topBarRight?: ReactNode;
  onAction: ActionBarOnAction;
  onPlayerPress?: (opponent: Opponent) => void;
};

export function TableLayout({
  snapshot,
  opponents,
  balanceCents,
  tableStatus,
  connectionStatus,
  actionMessage,
  handResultMessage,
  topBarLeft,
  topBarRight,
  onAction,
  onPlayerPress,
}: TableLayoutProps) {
  const [themePickerVisible, setThemePickerVisible] = useState(false);
  const { hand } = snapshot;
  const heroStatus = getHeroStatus(snapshot);
  const isMyTurn = getIsMyTurn(snapshot);
  const communityCards = getCommunityCards(snapshot);
  const potCents = getPotCents(snapshot);
  const heroCards = getHeroCards(snapshot);
  const heroStackCents = getHeroStackCents(snapshot);
  const heroActionOptions = snapshot.hero.actionOptions;
  const heroCalculations = snapshot.hero.calculations;
  const { 
    feltColor, 
    cardFaceColor, 
    cardBackColor, 
    accentColor, 
    backgroundColor, 
    tableRadius 
  } = usePreferencesStore();

  const heroName = snapshot.seats.find((s) => s.seat === snapshot.hero.seat)?.name;
  const isHeroWinner = !!handResultMessage && handResultMessage.winnerName === heroName;
  const isHeroDealer = getIsDealer(snapshot);
  const tableName = snapshot.table?.tableName ?? "Table";
  const playerCount = snapshot.seats.filter((s) => s.occupied).length;
  const maxSeats = snapshot.table?.maxSeats ?? snapshot.seats.length;
  const blinds = snapshot.table
    ? { smallBlindCents: snapshot.table.smallBlindCents, bigBlindCents: snapshot.table.bigBlindCents }
    : undefined;

  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const usableHeight = windowHeight - insets.top;
  const remaining = usableHeight - TOTAL_FIXED_HEIGHT;
  const useFallback = remaining < 0;
  const opponentStripHeight = useFallback ? OPPONENT_STRIP_HEIGHT_FALLBACK : OPPONENT_STRIP_HEIGHT;
  const heroZoneHeight = useFallback ? HERO_ZONE_HEIGHT_FALLBACK : HERO_ZONE_HEIGHT;

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
        }),
        { flex: 1, paddingTop: insets.top, flexDirection: "column", alignItems: "stretch" },
      ]}
      className="ui-surface-card border border-border-subtle shadow-lg"
    >
      <View
        collapsable={false}
        style={{ height: LAYOUT_TITLE_HEIGHT, flexShrink: 0 }}
        className="border-b border-border-subtle bg-panel ui-p-inline-4 ui-p-block-2 ui-stack-1 justify-center"
      >
        <Text variant="h1" numberOfLines={1} ellipsizeMode="tail" allowFontScaling={false}>
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
      <View collapsable={false} style={{ height: LAYOUT_TOP_BAR_HEIGHT, flexShrink: 0 }}>
        <TableTopBar
          balanceCents={balanceCents}
          left={topBarLeft}
          right={
            <View className="ui-row ui-inline-1">
              <IconButton
                variant="ghost"
                icon={<Icon name="theme" size={20} />}
                onPress={() => setThemePickerVisible(true)}
              />
              {topBarRight}
            </View>
          }
        />
      </View>
      <View collapsable={false} style={{ height: opponentStripHeight, width: "100%", flexShrink: 0 }}>
        <OpponentStrip
          opponents={opponents}
          winnerName={handResultMessage?.winnerName}
          onPlayerPress={onPlayerPress}
          height={opponentStripHeight}
        />
      </View>
      <View collapsable={false} style={{ flex: 1, justifyContent: "center" }}>
        <View
          collapsable={false}
          style={{ height: GAME_AREA_HEIGHT, flexShrink: 0, flexDirection: "column" }}
        >
          <View collapsable={false} style={{ height: 36 }}>
            <DealerAnnounceBar
              hand={hand ? { street: hand.street, potCents: hand.potCents } : undefined}
              actionMessage={actionMessage}
              handResultMessage={handResultMessage}
              tableStatus={tableStatus}
              nextHandAtTs={snapshot.nextHandAtTs}
            />
          </View>
          <View collapsable={false} style={{ flex: 1 }}>
            <CommunityBoard cards={communityCards} potCents={potCents} />
          </View>
        </View>
      </View>
      <View collapsable={false} style={{ height: heroZoneHeight, width: "100%", flexShrink: 0 }}>
        <HeroZone
          cards={heroCards}
          stackCents={heroStackCents}
          isMyTurn={isMyTurn}
          heroStatus={heroStatus}
          equity={heroCalculations?.equityPct}
          potOdds={heroCalculations?.potOddsPct}
          outs={heroCalculations?.outs}
          isWinner={isHeroWinner}
          isDealer={isHeroDealer}
          userName={heroName}
          height={heroZoneHeight}
        />
      </View>
      <View
        collapsable={false}
        style={{ height: ACTION_BAR_HEIGHT, width: "100%", flexShrink: 0, paddingBottom: insets.bottom }}
        className="border-t border-border-subtle"
      >
        <ActionBar
          isMyTurn={isMyTurn}
          heroStatus={heroStatus}
          actionOptions={heroActionOptions}
          potCents={potCents}
          connectionStatus={connectionStatus}
          onAction={onAction}
        />
      </View>
      <ThemePickerSheet visible={themePickerVisible} onClose={() => setThemePickerVisible(false)} />
    </View>
  );
}
