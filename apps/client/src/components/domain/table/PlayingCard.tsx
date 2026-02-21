import { View } from "react-native";
import { Text } from "@/components/base/Text";

const SUITS: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
const RANKS: Record<string, string> = {
  A: "A", 2: "2", 3: "3", 4: "4", 5: "5",
  6: "6", 7: "7", 8: "8", 9: "9", T: "10", J: "J", Q: "Q", K: "K",
};

const isRedSuit = (suit: string) => suit === "h" || suit === "d";

/** Fixed size so cards align consistently in community and hero areas. */
const CARD_WIDTH = 60;
const CARD_HEIGHT = 80;

const cardStyle = {
  width: CARD_WIDTH,
  height: CARD_HEIGHT,
  borderWidth: 1,
} as const;

const cardLayout = {
  ...cardStyle,
  flexDirection: "column" as const,
  justifyContent: "center" as const,
  alignItems: "center" as const,
};

export function PlayingCard({
  rank,
  suit,
  faceDown,
}: {
  rank?: string;
  suit?: string;
  faceDown?: boolean;
}) {
  const normalizedSuit = suit?.toLowerCase();
  const normalizedRank = rank?.toUpperCase();
  if (faceDown) {
    return (
      <View
        renderToHardwareTextureAndroid
        style={[cardStyle, { justifyContent: "center", alignItems: "center" }]}
        className="rounded-card border border-border-subtle bg-card-back"
      >
        <Text variant="muted" className="text-base" allowFontScaling={false}>?</Text>
      </View>
    );
  }
  const r = normalizedRank ? RANKS[normalizedRank] ?? normalizedRank : "?";
  const s = normalizedSuit ? SUITS[normalizedSuit] ?? normalizedSuit : "?";
  const red = normalizedSuit ? isRedSuit(normalizedSuit) : false;
  const textColor = red ? "#dc2626" : "#111827";
  return (
    <View
      renderToHardwareTextureAndroid
      style={[cardLayout, { backfaceVisibility: "hidden" as const }]}
      className="rounded-card border border-border-subtle bg-card-face gap-1"
    >
      <Text variant="h2" className="text-xl leading-tight font-extrabold" style={{ color: textColor }} allowFontScaling={false}>{r}</Text>
      <Text variant="body" className="text-base leading-none font-bold" style={{ color: textColor }} allowFontScaling={false}>{s}</Text>
    </View>
  );
}

export function CardBack() {
  return <PlayingCard faceDown />;
}
