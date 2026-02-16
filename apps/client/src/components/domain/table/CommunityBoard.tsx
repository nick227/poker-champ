import { View } from "react-native";
import { PlayingCard } from "./PlayingCard";
import { PotChipStack } from "./PotChipStack";

type Card = { rank: string; suit: string } | null;

const CARD_GAP = 10;

export function CommunityBoard({ cards, potCents }: { cards: Card[]; potCents: number }) {
  return (
    <View className="bg-felt mx-3 my-2 rounded-table border border-black/20 overflow-hidden">
      <View className="px-4 py-5 ui-col ui-stack-4">
        <View className="ui-row ui-center" style={{ gap: CARD_GAP }}>
          {cards.map((c, i) =>
            c ? (
              <PlayingCard key={i} rank={c.rank} suit={c.suit} />
            ) : (
              <PlayingCard key={i} faceDown />
            )
          )}
        </View>
        <View className="ui-row ui-center ui-stack-1 pt-1">
          <PotChipStack amountCents={potCents} />
        </View>
      </View>
    </View>
  );
}
