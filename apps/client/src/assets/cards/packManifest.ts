import type { CardFaceKey, CardFacePackId } from "./packs";

export type CardFacePackSource =
  | { type: "local"; folder: string }
  | { type: "remote"; baseUrl: string }
  | { type: "builtin"; variant: "simple" };

export type CardFacePackManifestEntry = {
  id: string;
  label: string;
  source: CardFacePackSource;
  previewCardKeys: readonly CardFaceKey[];
};

export const CARD_FACE_PACK_MANIFEST: readonly CardFacePackManifestEntry[] = [
  {
    id: "simple",
    label: "Simple",
    source: { type: "builtin", variant: "simple" },
    previewCardKeys: ["ace_of_spades", "king_of_hearts", "10_of_diamonds", "7_of_clubs"],
  },
  {
    id: "default",
    label: "Royal Casino",
    source: { type: "local", folder: "default" },
    previewCardKeys: ["ace_of_spades", "king_of_hearts", "10_of_diamonds", "7_of_clubs"],
  },
];

export function getCardFacePackById(id: CardFacePackId): CardFacePackManifestEntry | undefined {
  return CARD_FACE_PACK_MANIFEST.find((entry) => entry.id === id);
}
