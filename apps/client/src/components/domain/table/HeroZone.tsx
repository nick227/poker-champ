import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { PlayingCard } from "./PlayingCard";
import { CalculationsStrip } from "./CalculationsStrip";
import { formatCents } from "@/lib/format";
import { TABLE } from "@/constants/copy";
import type { HeroStatus } from "./table.adapter";
import { PotWinRing } from "./PotWinEffect";

type Card = { rank: string; suit: string } | null;

const CARD_GAP = 10;

function isInactive(status: HeroStatus): boolean {
  return status === "FOLDED" || status === "OUT" || status === "ABANDONED";
}

function getStatusLabel(status: HeroStatus): string | null {
  if (status === "FOLDED") return TABLE.fold;
  if (status === "OUT" || status === "ABANDONED") return TABLE.sittingOut;
  return null;
}

export function HeroZone({
  cards,
  stackCents,
  isMyTurn,
  heroStatus,
  equity = 0,
  potOdds = 0,
  outs = 0,
  isWinner = false,
}: {
  cards: Card[];
  stackCents: number;
  isMyTurn: boolean;
  heroStatus: HeroStatus;
  equity?: number;
  potOdds?: number;
  outs?: number;
  isWinner?: boolean;
}) {
  const folded = heroStatus === "FOLDED";
  const inactive = isInactive(heroStatus);
  const statusLabel = getStatusLabel(heroStatus);
  const content = (
    <View className="border-t border-border-subtle ui-p-4 ui-stack-4">
      <CalculationsStrip
        equity={equity}
        potOdds={potOdds}
        outs={outs}
        visible={!folded}
        muted={!isMyTurn}
      />
      <View className={`ui-row items-stretch ${inactive ? "opacity-55" : ""}`} style={{ gap: 20 }}>
        <View className="ui-col ui-center rounded-lg border border-border-subtle bg-panel/80 px-3 py-2" style={{ gap: 8 }}>
          <View className="ui-row ui-center" style={{ gap: 6 }}>
            <Text variant="label">Hole cards</Text>
            {statusLabel ? (
              <Text variant={folded ? "danger" : "muted"} className="text-xs">{statusLabel}</Text>
            ) : null}
          </View>
          <View className="ui-row ui-center" style={{ gap: CARD_GAP }}>
            {cards.map((c, i) =>
              c ? (
                <PlayingCard key={i} rank={c.rank} suit={c.suit} />
              ) : (
                <PlayingCard key={i} faceDown />
              )
            )}
          </View>
        </View>
        <View className="ui-col ui-center justify-center rounded-lg border border-border-subtle bg-panel/80 px-4 py-2 min-w-[88px]">
          <Text variant="label">Stack</Text>
          <Text variant="h2" className="text-2xl font-semibold">{formatCents(stackCents)}</Text>
        </View>
      </View>
    </View>
  );

  return isWinner ? <PotWinRing>{content}</PotWinRing> : content;
}
