import { View } from "react-native";
import { Text } from "@/components/base/Text";

const SUITS: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
const RANKS: Record<string, string> = {
  A: "A", 2: "2", 3: "3", 4: "4", 5: "5",
  6: "6", 7: "7", 8: "8", 9: "9", T: "10", J: "J", Q: "Q", K: "K",
};

const isRedSuit = (suit: string) => suit === "h" || suit === "d";

/** Fixed size so cards align consistently in community and hero areas. */
const CARD_WIDTH = 48;
const CARD_HEIGHT = 68;

export function PlayingCard({
  rank,
  suit,
  faceDown,
}: {
  rank?: string;
  suit?: string;
  faceDown?: boolean;
}) {
  const size = { width: CARD_WIDTH, height: CARD_HEIGHT };
  if (faceDown) {
    return (
      <View style={size} className="ui-center rounded-card border border-border-subtle bg-card-back">
        <Text variant="muted" className="text-base">?</Text>
      </View>
    );
  }
  const r = rank ? RANKS[rank] ?? rank : "?";
  const s = suit ? SUITS[suit] ?? suit : "?";
  const red = suit ? isRedSuit(suit) : false;
  const suitClass = red ? "text-danger" : "text-text";
  return (
    <View style={size} className="ui-col ui-center justify-center rounded-card border border-border-subtle bg-card-face gap-1">
      <Text variant="h2" className={`text-lg leading-tight ${suitClass}`}>{r}</Text>
      <Text variant="body" className={`text-sm font-semibold ${suitClass}`}>{s}</Text>
    </View>
  );
}

export function CardBack() {
  return <PlayingCard faceDown />;
}
