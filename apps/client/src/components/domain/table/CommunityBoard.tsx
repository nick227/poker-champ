import { View, useWindowDimensions } from "react-native";
import { useIsMobile } from "@/hooks/useIsMobile";
import { PlayingCard } from "./PlayingCard";
import type { UiCard } from "./table.adapter";
import { usePreferencesStore } from "@/stores/preferences.store";
import {
  COMMUNITY_CARD_GAP_DESKTOP,
  COMMUNITY_CARD_GAP_MOBILE,
  COMMUNITY_CARD_SCALE,
  COMMUNITY_CARD_SCALE_LANDSCAPE,
} from "./constants/tableLayout.constants";
import { BASE_CARD_HEIGHT } from "./constants/cardDimensions.constants";

function useOrientation() {
  const { width, height } = useWindowDimensions();
  return width > height ? "landscape" : "portrait";
}

/** Stable keys for 5 community card slots. */
const COMMUNITY_CARD_KEYS = ["flop1", "flop2", "flop3", "turn", "river"] as const;

export function CommunityBoard({ cards }: { cards: UiCard[] }) {
  const cardFacePackId = usePreferencesStore((state) => state.cardFacePackId);
  const orientation = useOrientation();

  const communityCardScale = orientation === "landscape" ? COMMUNITY_CARD_SCALE_LANDSCAPE : COMMUNITY_CARD_SCALE;
  /** Row height must match scaled card height so the container flexes correctly and centers. */
  const communityBoardHeight = Math.round(BASE_CARD_HEIGHT * communityCardScale);

  const isMobile = useIsMobile();
  const communityCardGap = isMobile ? COMMUNITY_CARD_GAP_MOBILE : COMMUNITY_CARD_GAP_DESKTOP;

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
