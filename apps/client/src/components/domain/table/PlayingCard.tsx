import { useMemo, useState } from "react";
import { Image, View } from "react-native";
import { Text } from "@/components/base/Text";
import { usePreferencesStore } from "@/stores/preferences.store";
import { getProceduralCardBackById } from "../../../assets/cards/cardBackProcedural";
import {
  DEFAULT_CARD_FACE_PACK_ID,
  isCardBackPackId,
  type CardFacePackId,
} from "../../../assets/cards/packs";
import { getCardFacePackById } from "../../../assets/cards/packManifest";
import { BuiltinCardFace } from "./BuiltinCardFace";
import { CardBackPattern } from "./CardBackPatterns";
import { DEFAULT_CARD_DIMENSIONS } from "./constants/cardDimensions.constants";
import { getCardBackSource, getCardFaceSource } from "./cardFaceAssets";

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
  packId = DEFAULT_CARD_FACE_PACK_ID,
}: {
  rank?: string;
  suit?: string;
  faceDown?: boolean;
  packId?: CardFacePackId;
}) {
  const [imageError, setImageError] = useState(false);

  const normalizedSuit = suit?.toLowerCase();
  const normalizedRank = rank?.toUpperCase();

  const cardFaceStyle: "glyph" | "image" = "image";
  const imageSource = useMemo(() => {
    if (faceDown) return null;
    if (cardFaceStyle !== "image") return null;
    if (imageError || !normalizedRank || !normalizedSuit) return null;
    return getCardFaceSource(normalizedRank, normalizedSuit, packId);
  }, [cardFaceStyle, imageError, normalizedRank, normalizedSuit, packId, faceDown]);

  if (faceDown) {
    return <CardBack />;
  }

  const pack = getCardFacePackById(packId);
  if (pack?.source.type === "builtin") {
    return (
      <View
        renderToHardwareTextureAndroid
        style={[cardStyle, { backfaceVisibility: "hidden" as const }]}
        className="rounded-card border border-border-subtle overflow-hidden"
      >
        <BuiltinCardFace
          variant={pack.source.variant}
          rank={normalizedRank ?? "?"}
          suit={normalizedSuit ?? "?"}
        />
      </View>
    );
  }

  if (imageSource) {
    return (
      <View
        renderToHardwareTextureAndroid
        style={[cardStyle, { backfaceVisibility: "hidden" as const }]}
        className="rounded-card border border-border-subtle bg-card-face overflow-hidden"
      >
        <Image
          source={imageSource}
          style={{ width: DEFAULT_CARD_DIMENSIONS.width, height: DEFAULT_CARD_DIMENSIONS.height }}
          resizeMode="contain"
          onError={() => setImageError(true)}
        />
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
      <Text
        variant="h2"
        className="text-xl leading-tight font-extrabold"
        style={{ color: textColor }}
        allowFontScaling={false}
      >
        {r}
      </Text>
      <Text
        variant="body"
        className="text-base leading-none font-bold"
        style={{ color: textColor }}
        allowFontScaling={false}
      >
        {s}
      </Text>
    </View>
  );
}

export function CardBack() {
  const cardBackPackId = usePreferencesStore((state) => state.cardBackPackId);
  const cardBackPattern = usePreferencesStore((state) => state.cardBackPattern);

  if (cardBackPackId != null && isCardBackPackId(cardBackPackId)) {
    const source = getCardBackSource(cardBackPackId);
    if (source) {
      return (
        <View
          renderToHardwareTextureAndroid
          style={[cardStyle, { backfaceVisibility: "hidden" as const }]}
          className="rounded-card border border-border-subtle overflow-hidden"
        >
          <Image
            source={source}
            style={{
              width: DEFAULT_CARD_DIMENSIONS.width,
              height: DEFAULT_CARD_DIMENSIONS.height,
            }}
            resizeMode="contain"
          />
        </View>
      );
    }
  }

  const procedural =
    getProceduralCardBackById(cardBackPattern) ?? getProceduralCardBackById("classic");
  if (!procedural) return null;

  return (
    <CardBackPattern
      pattern={procedural.id}
      backgroundHsl={procedural.background}
      patternHsl={procedural.pattern}
      width={DEFAULT_CARD_DIMENSIONS.width}
      height={DEFAULT_CARD_DIMENSIONS.height}
    />
  );
}
