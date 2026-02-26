import { View } from "react-native";
import { PlayingCard } from "./PlayingCard";
import { PotChipStack } from "./PotChipStack";
import type { UiCard } from "./table.adapter";
import {
  COMMUNITY_BOARD_HEIGHT,
  COMMUNITY_CARD_GAP,
  COMMUNITY_CARD_SCALE,
} from "./constants/components/communityBoard.layout";

/** Stable keys for 5 community card slots. */
const COMMUNITY_CARD_KEYS = ["flop1", "flop2", "flop3", "turn", "river"] as const;

export function CommunityBoard({ cards, potCents }: { cards: UiCard[]; potCents: number }) {
  return (
    <View
      collapsable={false}
      className="bg-felt justify-center rounded-sm"
      style={{ flexDirection: "column", height: COMMUNITY_BOARD_HEIGHT }}
    >
      <View
        collapsable={false}
        className="ui-stack-4"
        style={{
          flexDirection: "column",
          flexGrow: 0,
          flexShrink: 0,
        }}
      >
        <View
          collapsable={false}
          className="ui-row ui-center"
          style={{
            gap: COMMUNITY_CARD_GAP,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {cards.map((c, i) => {
            const key = COMMUNITY_CARD_KEYS[i] ?? `card-${i}`;
            return c ? (
              <View key={key} style={{ transform: [{ scale: COMMUNITY_CARD_SCALE }] }}>
                <PlayingCard rank={c.rank} suit={c.suit} />
              </View>
            ) : (
              <View key={key} style={{ transform: [{ scale: COMMUNITY_CARD_SCALE }] }}>
                <PlayingCard faceDown />
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
