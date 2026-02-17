import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { vars } from "nativewind";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { Spacer } from "@/components/base/Layout";
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
import {
  getHeroStatus,
  getIsMyTurn,
  getCommunityCards,
  getHeroCards,
  getHeroStackCents,
  getPotCents,
} from "./table.adapter";

export type { Opponent };

export type HandResultMessage = { winnerName: string; amountCents: number; winningHandDescr?: string };

export type TableLayoutProps = {
  snapshot: TableSnapshotPayload;
  opponents: Opponent[];
  balanceCents: number;
  tableStatus?: string;
  handResultMessage?: HandResultMessage;
  topBarLeft?: ReactNode;
  topBarRight?: ReactNode;
  onAction: ActionBarOnAction;
  onPlayerPress?: (opponent: Opponent) => void;
  equity?: number;
  potOdds?: number;
  outs?: number;
};

export function TableLayout({
  snapshot,
  opponents,
  balanceCents,
  tableStatus,
  handResultMessage,
  topBarLeft,
  topBarRight,
  onAction,
  onPlayerPress,
  equity,
  potOdds,
  outs,
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

  return (
    <View
      style={vars({
        "--c-felt": feltColor,
        "--c-card-face": cardFaceColor,
        "--c-card-back": cardBackColor,
        "--c-gold": accentColor,
        "--c-brand": accentColor,
        "--c-bg": backgroundColor,
        "--r-table": tableRadius,
      })}
      className="flex-1 ui-surface-card overflow-hidden border border-border-subtle shadow-lg"
    >
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
      <OpponentStrip
        opponents={opponents}
        winnerName={handResultMessage?.winnerName}
        onPlayerPress={onPlayerPress}
      />
      <Spacer />
      <DealerAnnounceBar
        hand={hand ? { street: hand.street, potCents: hand.potCents } : undefined}
        handResultMessage={handResultMessage}
        tableStatus={tableStatus}
        nextHandAtTs={snapshot.nextHandAtTs}
      />
      <CommunityBoard cards={communityCards} potCents={potCents} />
      <Spacer />
      <HeroZone
        cards={heroCards}
        stackCents={heroStackCents}
        isMyTurn={isMyTurn}
        heroStatus={heroStatus}
        equity={equity ?? 0}
        potOdds={potOdds ?? 0}
        outs={outs ?? 0}
        isWinner={isHeroWinner}
      />
      <ActionBar
        isMyTurn={isMyTurn}
        heroStatus={heroStatus}
        actionOptions={heroActionOptions}
        potCents={potCents}
        onAction={onAction}
      />
      <ThemePickerSheet visible={themePickerVisible} onClose={() => setThemePickerVisible(false)} />
    </View>
  );
}
