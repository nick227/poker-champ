import { View } from "react-native";
import { PlayingCard } from "../PlayingCard";
import type { CardFacePackId } from "@/assets/cards/packs";
import type { SeatPlateCards } from "./seatPlate.types";
import { BASE_CARD_HEIGHT, BASE_CARD_WIDTH } from "../tokens/card-dimensions.tokens";

const PAIR_BASE_WIDTH = BASE_CARD_WIDTH * 2 - 22;

/** Compact hole-card fan — overlays the avatar (GG), does not stack a tall column. */
export function SeatHoleCards({
  cards,
  packId,
  scale,
  inactive = false,
}: {
  cards: SeatPlateCards;
  packId: CardFacePackId;
  scale: number;
  inactive?: boolean;
}) {
  if (!cards.visible) return null;
  const left = cards.faceDown || !cards.left ? (
    <PlayingCard faceDown />
  ) : (
    <PlayingCard rank={cards.left.rank} suit={cards.left.suit} packId={packId} />
  );
  const right = cards.faceDown || !cards.right ? (
    <PlayingCard faceDown />
  ) : (
    <PlayingCard rank={cards.right.rank} suit={cards.right.suit} packId={packId} />
  );
  return (
    <View
      pointerEvents="none"
      style={{
        width: PAIR_BASE_WIDTH * scale,
        height: BASE_CARD_HEIGHT * scale,
        alignItems: "center",
        justifyContent: "flex-start",
        opacity: inactive ? 0.12 : 1,
        transform: [{ translateY: inactive ? 8 : 2 }],
      }}
    >
      <View
        style={{
          position: "absolute",
          top: -(BASE_CARD_HEIGHT * (1 - scale)) / 2,
          left: -(PAIR_BASE_WIDTH * (1 - scale)) / 2,
          width: PAIR_BASE_WIDTH,
          height: BASE_CARD_HEIGHT,
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "center",
          transform: [{ scale }],
        }}
      >
        <View
          style={{
            marginRight: -22,
            transform: [{ rotate: inactive ? "-6deg" : "-9deg" }],
            zIndex: 1,
            boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 6, color: "rgba(0,0,0,0.55)" }],
          }}
        >
          {left}
        </View>
        <View
          style={{
            transform: [{ rotate: inactive ? "4deg" : "8deg" }],
            zIndex: 2,
            boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 6, color: "rgba(0,0,0,0.55)" }],
          }}
        >
          {right}
        </View>
      </View>
    </View>
  );
}
