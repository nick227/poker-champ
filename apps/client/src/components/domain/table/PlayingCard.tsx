import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { usePreferencesStore } from "@/stores/preferences.store";
import { CardBackPattern } from "./CardBackPatterns";
import { DEFAULT_CARD_DIMENSIONS, CARD_SCALES } from "./constants/cardDimensions.constants";

const SUITS: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
const RANKS: Record<string, string> = {
  A: "A", 2: "2", 3: "3", 4: "4", 5: "5",
  6: "6", 7: "7", 8: "8", 9: "9", T: "10", J: "J", Q: "Q", K: "K",
};

const isRedSuit = (suit: string) => suit === "h" || suit === "d";

const cardStyle = {
  width: DEFAULT_CARD_DIMENSIONS.width,
  height: DEFAULT_CARD_DIMENSIONS.height,
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
  const { cardBackPattern, cardBackHue, cardBackSaturation, cardBackLightness } = usePreferencesStore();
  
  const normalizedSuit = suit?.toLowerCase();
  const normalizedRank = rank?.toUpperCase();
  if (faceDown) {
    return (
      <CardBackPattern
        pattern={cardBackPattern}
        hue={cardBackHue}
        saturation={cardBackSaturation}
        lightness={cardBackLightness}
        width={DEFAULT_CARD_DIMENSIONS.width}
        height={DEFAULT_CARD_DIMENSIONS.height}
      />
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
