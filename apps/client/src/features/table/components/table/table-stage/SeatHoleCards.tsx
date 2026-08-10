import { View } from "react-native";
import { PlayingCard } from "../PlayingCard";
import type { CardFacePackId } from "@/assets/cards/packs";
import type { SeatPlateCards } from "./seatPlate.types";

/** Compact hole-card fan — overlays the avatar (GG), does not stack a tall column. */
export function SeatHoleCards({
  cards,
  packId,
  scale,
}: {
  cards: SeatPlateCards;
  packId: CardFacePackId;
  scale: number;
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
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "center",
        transform: [{ scale }],
      }}
    >
      <View style={{ marginRight: -22, transform: [{ rotate: "-12deg" }], zIndex: 1 }}>{left}</View>
      <View style={{ transform: [{ rotate: "10deg" }], zIndex: 2 }}>{right}</View>
    </View>
  );
}
