import { View } from "react-native";
import { useIsMobile } from "@/hooks/useIsMobile";
import { PlayingCard } from "../PlayingCard";
import type { UiCard } from "../table.adapter";
import { usePreferencesStore } from "@/stores/preferences.store";
import { BASE_CARD_HEIGHT, BASE_CARD_WIDTH } from "../tokens/card-dimensions.tokens";
import { CARDS } from "./layout";
import { MeasuredBoundsReporter } from "./BoardBoundsReporter";
import type { Rect } from "@/features/table/animations/animationTypes";
import { communityBoardScaleForBox } from "./communityBoardScale";

const COMMUNITY_CARD_KEYS = ["flop1", "flop2", "flop3", "turn", "river"] as const;

export function CommunityBoard({
  cards,
  onCardSlotBounds,
  targetWidth,
  targetHeight,
}: {
  cards: UiCard[];
  onCardSlotBounds?: (index: number, rect: Rect) => void;
  /** Board safe-zone width (px) — preferred over window orientation. */
  targetWidth?: number;
  targetHeight?: number;
}) {
  const cardFacePackId = usePreferencesStore((state) => state.cardFacePackId);
  const isMobile = useIsMobile();
  const visibleCards = cards
    .map((card, index) => ({ card, index }))
    .filter((entry): entry is { card: NonNullable<UiCard>; index: number } => entry.card != null);
  // Tight gap when filling a measured board box so cards stay large.
  const gap =
    targetWidth && targetHeight
      ? isMobile
        ? 4
        : 10
      : isMobile
        ? CARDS.GAP_MOBILE
        : CARDS.GAP_DESKTOP;

  const communityCardScale =
    targetWidth && targetHeight
      ? communityBoardScaleForBox(
          targetWidth,
          targetHeight,
          gap,
          visibleCards.length,
          // Community cards are the primary gameplay read. They may compress
          // on phones, but never below the local player's card scale.
          isMobile ? 0.82 : 1.35,
        )
      : isMobile
        ? CARDS.SCALE
        : CARDS.SCALE_LANDSCAPE;

  const communityBoardHeight = Math.round(BASE_CARD_HEIGHT * communityCardScale);
  const communityCardWidth = Math.round(BASE_CARD_WIDTH * communityCardScale);

  return (
    <View
      collapsable={false}
      className="ui-row ui-center"
      style={{
        gap,
        alignItems: "center",
        justifyContent: "center",
        height: communityBoardHeight,
        width: "100%",
        maxWidth: targetWidth,
      }}
    >
      {visibleCards.map(({ card: c, index: i }) => {
        const key = COMMUNITY_CARD_KEYS[i] ?? `card-${i}`;
        const slotStyle = {
          transform: [{ scale: communityCardScale }],
          boxShadow: [
            { offsetX: 0, offsetY: 7, blurRadius: 14, color: "rgba(0,0,0,0.45)" },
          ],
        };
        const slotContent = (
          <View style={slotStyle}>
            <PlayingCard rank={c.rank} suit={c.suit} packId={cardFacePackId} />
          </View>
        );
        const slot = (
          <View
            testID={`community-card-slot-${i}-face-up`}
            style={{
              width: communityCardWidth,
              height: communityBoardHeight,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {slotContent}
          </View>
        );
        if (onCardSlotBounds) {
          return (
            <MeasuredBoundsReporter
              key={key}
              onBounds={(rect) => onCardSlotBounds(i, rect)}
              style={{ width: communityCardWidth, height: communityBoardHeight }}
            >
              {slot}
            </MeasuredBoundsReporter>
          );
        }
        return <View key={key}>{slot}</View>;
      })}
    </View>
  );
}
