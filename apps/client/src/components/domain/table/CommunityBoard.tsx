import { View, Text } from "react-native";
import { PlayingCard } from "./PlayingCard";
import type { UiCard } from "./table.adapter";
import { usePreferencesStore } from "@/stores/preferences.store";
import {
  COMMUNITY_BOARD_HEIGHT,
  COMMUNITY_CARD_GAP,
  COMMUNITY_CARD_SCALE,
  COMMUNITY_BOARD_HEIGHT_LANDSCAPE,
  COMMUNITY_CARD_SCALE_LANDSCAPE,
} from "./constants/components/communityBoard.layout";
import { FeltBackground } from "./FeltBackground";
import { useWindowDimensions } from "react-native";

function useOrientation() {
  const { width, height } = useWindowDimensions();
  return width > height ? "landscape" : "portrait";
}

/** Stable keys for 5 community card slots. */
const COMMUNITY_CARD_KEYS = ["flop1", "flop2", "flop3", "turn", "river"] as const;

export function CommunityBoard({ cards, potCents }: { cards: UiCard[]; potCents: number }) {
  const cardFacePackId = usePreferencesStore((state) => state.cardFacePackId);
  const orientation = useOrientation();

  const communityBoardHeight = orientation === "landscape" ? COMMUNITY_BOARD_HEIGHT_LANDSCAPE : COMMUNITY_BOARD_HEIGHT;
  const communityCardScale = orientation === "landscape" ? COMMUNITY_CARD_SCALE_LANDSCAPE : COMMUNITY_CARD_SCALE;

  return (
    <FeltBackground
      className="justify-center rounded-sm"
      style={{ flexDirection: "column", height: communityBoardHeight }}
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
              <View key={key} style={{ transform: [{ scale: communityCardScale }] }}>
                <PlayingCard rank={c.rank} suit={c.suit} packId={cardFacePackId} />
              </View>
            ) : (
              <View key={key} style={{ transform: [{ scale: communityCardScale }] }}>
                <PlayingCard faceDown />
              </View>
            );
          })}
        </View>
      </View>
    </FeltBackground>
  );
}
