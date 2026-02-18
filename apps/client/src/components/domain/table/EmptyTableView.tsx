import { type ReactNode } from "react";
import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { vars } from "nativewind";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { Spacer } from "@/components/base/Layout";
import { TableTopBar } from "./TableTopBar";
import { OpponentStrip, type Opponent } from "./OpponentStrip";
import { DealerAnnounceBar } from "./DealerAnnounceBar";
import { CommunityBoard } from "./CommunityBoard";
import { HeroZone } from "./HeroZone";
import { Button } from "@/components/base/Button";
import { usePreferencesStore } from "@/stores/preferences.store";
import { getCommunityCards, getHeroCards, getHeroStatus, getHeroStackCents, getPotCents } from "./table.adapter";

export type EmptyTableViewProps = {
  snapshot: TableSnapshotPayload;
  opponents: Opponent[];
  balanceCents: number;
  tableStatus?: string;
  handResultMessage?: { winnerName: string; amountCents: number; winningHandDescr?: string };
  topBarLeft?: ReactNode;
  topBarRight?: ReactNode;
  onPlayerPress?: (opponent: Opponent) => void;
  onAddBot?: () => void;
  onReturnToLobby?: () => void;
  addBotPending?: boolean;
};

export function EmptyTableView({
  snapshot,
  opponents,
  balanceCents,
  tableStatus,
  handResultMessage,
  topBarLeft,
  topBarRight,
  onPlayerPress,
  onAddBot,
  onReturnToLobby,
  addBotPending = false,
}: EmptyTableViewProps) {
  const heroStatus = getHeroStatus(snapshot);
  const heroStackCents = getHeroStackCents(snapshot);
  const heroCards = getHeroCards(snapshot);
  const potCents = getPotCents(snapshot);
  const communityCards = getCommunityCards(snapshot);
  const hasOpponents = opponents.length > 0;
  const isBetweenHands = Boolean(handResultMessage) || Boolean(snapshot.nextHandAtTs);
  const canShowAddBotCta = snapshot.hero.youAreSeated && onAddBot && !hasOpponents && !isBetweenHands;
  const waitingCopy = handResultMessage
    ? "Hand complete. Showing result before next deal."
    : snapshot.nextHandAtTs
      ? "Next deal is starting shortly."
      : hasOpponents
        ? "Players are seated. Waiting for next deal."
        : "Waiting for another player to start a hand. Add a bot or wait for others to join.";
  const { feltColor, cardFaceColor, cardBackColor, accentColor, backgroundColor, tableRadius } =
    usePreferencesStore();

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
      <TableTopBar balanceCents={balanceCents} left={topBarLeft} right={topBarRight} />
      <OpponentStrip opponents={opponents} winnerName={handResultMessage?.winnerName} onPlayerPress={onPlayerPress} />
      <Spacer />
      <DealerAnnounceBar
        hand={undefined}
        handResultMessage={handResultMessage}
        tableStatus={tableStatus}
        nextHandAtTs={snapshot.nextHandAtTs}
      />
      <CommunityBoard cards={communityCards} potCents={potCents} />
      <Spacer />
      <HeroZone
        cards={heroCards}
        stackCents={heroStackCents}
        isMyTurn={false}
        heroStatus={heroStatus}
        userName={snapshot.seats.find((s) => s.seat === snapshot.hero.seat)?.name}
      />
      <View className="border-t border-border-subtle ui-p-4 ui-stack-3">
        {canShowAddBotCta ? (
          <Button
            variant="primary"
            title="+ Add bot to start hand"
            onPress={onAddBot}
            loading={addBotPending}
          />
        ) : null}
        <View className="ui-row ui-inline-2">
          <Text className="flex-1 text-muted-foreground text-sm">
            {waitingCopy}
          </Text>
        </View>
        {onReturnToLobby ? (
          <Button variant="ghost" title="Return to lobby" onPress={onReturnToLobby} />
        ) : null}
      </View>
    </View>
  );
}
