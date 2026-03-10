import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { DEFAULT_CARD_DIMENSIONS } from "./constants/cardDimensions.constants";

const SUITS: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
const RANKS: Record<string, string> = {
  A: "A", 2: "2", 3: "3", 4: "4", 5: "5",
  6: "6", 7: "7", 8: "8", 9: "9", T: "10", J: "J", Q: "Q", K: "K",
};
/** Single char for large-print (T for 10). */
const RANK_CHAR: Record<string, string> = {
  A: "A", 2: "2", 3: "3", 4: "4", 5: "5",
  6: "6", 7: "7", 8: "8", 9: "9", T: "T", J: "J", Q: "Q", K: "K",
};

const isRedSuit = (suit: string) => suit === "h" || suit === "d";

export type BuiltinCardFaceVariant = "simple" | "large-print";

export function BuiltinCardFace({
  variant,
  rank,
  suit,
  width = DEFAULT_CARD_DIMENSIONS.width,
  height = DEFAULT_CARD_DIMENSIONS.height,
}: {
  variant: BuiltinCardFaceVariant;
  rank: string;
  suit: string;
  width?: number;
  height?: number;
}) {
  const normalizedSuit = suit?.toLowerCase();
  const normalizedRank = rank?.toUpperCase();
  const r = normalizedRank ? RANKS[normalizedRank] ?? normalizedRank : "?";
  const s = normalizedSuit ? SUITS[normalizedSuit] ?? normalizedSuit : "?";
  const red = normalizedSuit ? isRedSuit(normalizedSuit) : false;

  const ink = "#111827";
  const redSuit = "#dc2626";
  const color = red ? redSuit : ink;

  if (variant === "large-print") {
    const rankChar = normalizedRank ? RANK_CHAR[normalizedRank] ?? normalizedRank : "?";
    const twoChars = `${rankChar}${s}`;
    const fontSize = Math.min(width, height) * 0.48;
    return (
      <View
        style={{
          width,
          height,
          borderWidth: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
        className="rounded-card border border-border-subtle bg-card-face"
      >
        <Text
          variant="h2"
          className="font-extrabold leading-none"
          style={{ color, fontSize }}
          allowFontScaling={false}
        >
          {twoChars}
        </Text>
      </View>
    );
  }

  if (variant !== "simple") {
    return null;
  }

  return (
    <View
      style={{
        width,
        height,
        borderWidth: 1,
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
      }}
      className="rounded-card border border-border-subtle bg-card-face gap-0.5"
    >
      <Text
        variant="h2"
        className="text-2xl leading-tight font-extrabold"
        style={{ color }}
        allowFontScaling={false}
      >
        {r}
      </Text>
      <Text
        variant="body"
        className="text-lg font-bold leading-none"
        style={{ color }}
        allowFontScaling={false}
      >
        {s}
      </Text>
    </View>
  );
}
