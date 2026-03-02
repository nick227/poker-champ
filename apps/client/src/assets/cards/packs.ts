import {
  CARD_FACE_PACKS,
  type CardFaceKey,
  type CardFacePackId as RegistryPackId,
  type CardFacePack,
} from "./generated/cardFacePackRegistry";

const BUILTIN_CARD_FACE_PACK_IDS = ["simple"] as const;

export type CardFacePackId = RegistryPackId | (typeof BUILTIN_CARD_FACE_PACK_IDS)[number];
export const DEFAULT_CARD_FACE_PACK_ID: CardFacePackId = "simple";

export { CARD_FACE_PACKS, type CardFaceKey, type CardFacePack };

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
