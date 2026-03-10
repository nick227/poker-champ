import { View, useWindowDimensions } from "react-native";
import { useIsMobile } from "@/hooks/useIsMobile";
import { PlayingCard } from "../PlayingCard";
import type { UiCard } from "../table.adapter";
import { usePreferencesStore } from "@/stores/preferences.store";
import { BASE_CARD_HEIGHT } from "../tokens/card-dimensions.tokens";
import { CARDS } from "./layout";

/** Stable keys for 5 community card slots. */
const COMMUNITY_CARD_KEYS = ["flop1", "flop2", "flop3", "turn", "river"] as const;

export function CommunityBoard({ cards }: { cards: UiCard[] }) {
  const cardFacePackId = usePreferencesStore((state) => state.cardFacePackId);
  const { width, height } = useWindowDimensions();
  const orientation = width > height ? "landscape" : "portrait";

  const communityCardScale = orientation === "landscape" ? CARDS.SCALE_LANDSCAPE : CARDS.SCALE;
  const communityBoardHeight = Math.round(BASE_CARD_HEIGHT * communityCardScale);

  const isMobile = useIsMobile();
  const communityCardGap = isMobile ? CARDS.GAP_MOBILE : CARDS.GAP_DESKTOP;

  return (
    <View
      collapsable={false}
      className="ui-row ui-center"
      style={{
        gap: communityCardGap,
        alignItems: "center",
        justifyContent: "center",
        height: communityBoardHeight,
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
  );
}
