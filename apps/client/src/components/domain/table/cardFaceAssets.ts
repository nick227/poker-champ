import type { ImageSourcePropType } from "react-native";
import {
  CARD_FACE_PACKS,
  DEFAULT_CARD_FACE_PACK_ID,
  type CardFacePackId,
} from "../../../assets/cards/packs";

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
    console.warn(
      `[cardFaceAssets] Unexpected rank value "${rank}" (normalized: "${normalizedRank}").` +
        ' Expected a single rank code like "A", "K", "Q", "J", "T", or "2"–"10".',
    );
  }
  const suitName = SUIT_NAME_MAP[normalizedSuit];

  if (!suitName) return null;

  return `${rankName}_of_${suitName}`;
}

const KEY_TO_RANK: Record<string, string> = {
  ace: "A",
  king: "K",
  queen: "Q",
  jack: "J",
  "10": "T",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
};

const KEY_TO_SUIT: Record<string, string> = {
  spades: "s",
  hearts: "h",
  diamonds: "d",
  clubs: "c",
};

/** Parse a CardFaceKey into rank and suit codes for builtin preview / components. */
export function keyToRankSuit(key: string): { rank: string; suit: string } | null {
  const parts = key.split("_of_");
  if (parts.length !== 2) return null;
  const [rankName, suitName] = parts;
  const rank = KEY_TO_RANK[rankName];
  const suit = KEY_TO_SUIT[suitName];
  if (!rank || !suit) return null;
  return { rank, suit };
}

export function getCardFaceSource(
  rank?: string,
  suit?: string,
  packId: CardFacePackId = DEFAULT_CARD_FACE_PACK_ID,
): ImageSourcePropType | null {
  const key = toCardKey(rank, suit);
  if (!key) return null;

  const pack = Object.prototype.hasOwnProperty.call(CARD_FACE_PACKS, packId)
    ? CARD_FACE_PACKS[packId as keyof typeof CARD_FACE_PACKS]
    : undefined;
  if (!pack) return null;

  const source = pack[key as keyof typeof pack] as ImageSourcePropType | undefined;
  return source ?? null;
}
