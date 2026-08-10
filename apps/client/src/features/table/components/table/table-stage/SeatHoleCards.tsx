import { View } from "react-native";
import { PlayingCard } from "../PlayingCard";
import type { CardFacePackId } from "@/assets/cards/packs";
import type { SeatPlateCards } from "./seatPlate.types";

/** Dominant hole-card fan — largest element in the seat cluster (GG-style). */
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
        // Overlap cards like GG; negative margin pulls pair tight.
        marginHorizontal: -6,
      }}
    >
      <View style={{ marginRight: -18, transform: [{ rotate: "-14deg" }], zIndex: 1 }}>{left}</View>
      <View style={{ transform: [{ rotate: "12deg" }], zIndex: 2 }}>{right}</View>
    </View>
  );
}
