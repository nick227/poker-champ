import type { ReactNode } from "react";
import { View } from "react-native";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { Spacer } from "@/components/base/Layout";
import { TableTopBar } from "./TableTopBar";
import { OpponentStrip, type Opponent } from "./OpponentStrip";
import { DealerAnnounceBar } from "./DealerAnnounceBar";
import { CommunityBoard } from "./CommunityBoard";
import { HeroZone } from "./HeroZone";
import { ActionBar, type ActionBarOnAction } from "./ActionBar";
import {
  getHeroStatus,
  getIsMyTurn,
  getCommunityCards,
  getHeroCards,
  getHeroStackCents,
  getPotCents,
} from "./table.adapter";

export type { Opponent };

export type TableLayoutProps = {
  snapshot: TableSnapshotPayload;
  opponents: Opponent[];
  balanceCents: number;
  tableStatus?: string;
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
  topBarLeft,
  topBarRight,
  onAction,
  onPlayerPress,
  equity,
  potOdds,
  outs,
}: TableLayoutProps) {
  const { hand } = snapshot;
  const heroStatus = getHeroStatus(snapshot);
  const isMyTurn = getIsMyTurn(snapshot);
  const communityCards = getCommunityCards(snapshot);
  const potCents = getPotCents(snapshot);
  const heroCards = getHeroCards(snapshot);
  const heroStackCents = getHeroStackCents(snapshot);
  const heroActionOptions = snapshot.hero.actionOptions;

  return (
    <View className="flex-1 ui-surface-card overflow-hidden rounded-table border border-border-subtle shadow-lg">
      <TableTopBar balanceCents={balanceCents} left={topBarLeft} right={topBarRight} />
      <OpponentStrip opponents={opponents} onPlayerPress={onPlayerPress} />
      <Spacer />
      <DealerAnnounceBar
        hand={{ street: hand!.street, potCents: hand!.potCents }}
        lastHandResult={snapshot.lastHandResult}
        tableStatus={tableStatus}
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
      />
      <ActionBar
        isMyTurn={isMyTurn}
        heroStatus={heroStatus}
        actionOptions={heroActionOptions}
        potCents={potCents}
        onAction={onAction}
      />
    </View>
  );
}
