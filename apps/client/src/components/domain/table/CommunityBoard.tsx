import { View } from "react-native";
import { PlayingCard } from "./PlayingCard";
import { PotChipStack } from "./PotChipStack";

type Card = { rank: string; suit: string } | null;

const CARD_GAP = 10;
const CARD_ROW_HEIGHT = 68;
const POT_ROW_MIN_HEIGHT = 44;
/** Extra bottom padding so pot value is not cut off by felt edge. */
const FELT_BOTTOM_PADDING = 20;

export function CommunityBoard({ cards, potCents }: { cards: Card[]; potCents: number }) {
  return (
    <View
      collapsable={false}
      className="bg-felt mx-3 my-2 rounded-table border border-black/20"
      style={{ flexDirection: "column" }}
    >
      <View
        collapsable={false}
        className="px-4 py-5 ui-stack-4"
        style={{ flexDirection: "column", paddingBottom: FELT_BOTTOM_PADDING }}
      >
        <View
          collapsable={false}
          className="ui-row ui-center"
          style={{ gap: CARD_GAP, height: CARD_ROW_HEIGHT, alignItems: "center" }}
        >
          {cards.map((c, i) =>
            c ? (
              <PlayingCard key={i} rank={c.rank} suit={c.suit} />
            ) : (
              <PlayingCard key={i} faceDown />
            )
          )}
        </View>
        <View
          collapsable={false}
          style={{ minHeight: POT_ROW_MIN_HEIGHT }}
          className="ui-row ui-center ui-stack-1 pt-1"
        >
          <PotChipStack amountCents={potCents} />
        </View>
      </View>
    </View>
  );
}
