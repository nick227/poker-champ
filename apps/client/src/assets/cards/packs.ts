import {
  CARD_BACK_PACKS,
  CARD_FACE_PACKS,
  type CardBackPackId,
  type CardFaceKey,
  type CardFacePackId as RegistryPackId,
  type CardFacePack,
} from "./generated/cardPackRegistry";

const BUILTIN_CARD_FACE_PACK_IDS = ["simple", "large-print"] as const;

export type CardFacePackId = RegistryPackId | (typeof BUILTIN_CARD_FACE_PACK_IDS)[number];
export const DEFAULT_CARD_FACE_PACK_ID: CardFacePackId = "simple";

export { CARD_BACK_PACKS, CARD_FACE_PACKS, type CardBackPackId, type CardFaceKey, type CardFacePack };

export function isCardFacePackId(value: unknown): value is CardFacePackId {
  if (typeof value !== "string") return false;
  return (
    BUILTIN_CARD_FACE_PACK_IDS.includes(value as (typeof BUILTIN_CARD_FACE_PACK_IDS)[number]) ||
    Object.prototype.hasOwnProperty.call(CARD_FACE_PACKS, value)
  );
}

export function getValidCardFacePackId(value: unknown): CardFacePackId {
  return isCardFacePackId(value) ? value : DEFAULT_CARD_FACE_PACK_ID;
}

export function isCardBackPackId(value: unknown): value is CardBackPackId {
  if (typeof value !== "string") return false;
  return Object.prototype.hasOwnProperty.call(CARD_BACK_PACKS, value);
}
