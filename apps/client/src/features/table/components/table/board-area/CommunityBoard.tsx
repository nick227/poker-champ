import { View } from "react-native";
import { useIsMobile } from "@/hooks/useIsMobile";
import { PlayingCard } from "../PlayingCard";
import type { UiCard } from "../table.adapter";
import { usePreferencesStore } from "@/stores/preferences.store";
import { BASE_CARD_HEIGHT } from "../tokens/card-dimensions.tokens";
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
  const gap = isMobile ? CARDS.GAP_MOBILE : CARDS.GAP_DESKTOP;

  const communityCardScale =
    targetWidth && targetHeight
      ? communityBoardScaleForBox(targetWidth, targetHeight, gap)
      : isMobile
        ? CARDS.SCALE
        : CARDS.SCALE_LANDSCAPE;

  const communityBoardHeight = Math.round(BASE_CARD_HEIGHT * communityCardScale);

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
      {cards.map((c, i) => {
        const key = COMMUNITY_CARD_KEYS[i] ?? `card-${i}`;
        const slotStyle = { transform: [{ scale: communityCardScale }] };
        const slotContent = c ? (
          <View style={slotStyle}>
            <PlayingCard rank={c.rank} suit={c.suit} packId={cardFacePackId} />
          </View>
        ) : (
          <View style={slotStyle}>
            <PlayingCard faceDown />
          </View>
        );
        const slot = (
          <View testID={`community-card-slot-${i}-${c ? "face-up" : "face-down"}`}>
            {slotContent}
          </View>
        );
        if (onCardSlotBounds) {
          return (
            <MeasuredBoundsReporter
              key={key}
              onBounds={(rect) => onCardSlotBounds(i, rect)}
              style={{}}
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
