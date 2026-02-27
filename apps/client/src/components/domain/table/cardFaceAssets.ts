import type { ImageSourcePropType } from "react-native";
import {
  CARD_FACE_PACKS,
  DEFAULT_CARD_FACE_PACK_ID,
  type CardFacePackId,
} from "@/assets/cards/packs";

const RANK_NAME_MAP: Record<string, string> = {
  A: "ace",
  K: "king",
  Q: "queen",
  J: "jack",
  T: "10",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "10",
};

const SUIT_NAME_MAP: Record<string, string> = {
  c: "clubs",
  d: "diamonds",
  h: "hearts",
  s: "spades",
};

function toCardKey(rank?: string, suit?: string): string | null {
  if (!rank || !suit) return null;

  const normalizedRank = rank.toUpperCase();
  const normalizedSuit = suit.toLowerCase();

  const rankName = RANK_NAME_MAP[normalizedRank] ?? normalizedRank.toLowerCase();

  if (
    process.env.NODE_ENV === "development" &&
    normalizedRank.length > 1 &&
    normalizedRank !== "10"
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      `[cardFaceAssets] Unexpected rank value "${rank}" (normalized: "${normalizedRank}").` +
        ' Expected a single rank code like "A", "K", "Q", "J", "T", or "2"–"10".',
    );
  }
  const suitName = SUIT_NAME_MAP[normalizedSuit];

  if (!suitName) return null;

  return `${rankName}_of_${suitName}`;
}

export function getCardFaceSource(
  rank?: string,
  suit?: string,
  packId: CardFacePackId = DEFAULT_CARD_FACE_PACK_ID,
): ImageSourcePropType | null {
  const key = toCardKey(rank, suit);
  if (!key) return null;

  const pack = CARD_FACE_PACKS[packId];
  const source = pack[key as keyof typeof pack] as ImageSourcePropType | undefined;

  return source ?? null;
}

