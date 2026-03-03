export type CardFacePackSource =
  | { type: "local"; folder: string }
  | { type: "remote"; baseUrl: string }
  | { type: "builtin"; variant: "simple" | "large-print" };

export type CardFacePackManifestEntry = {
  id: string;
  label: string;
  source: CardFacePackSource;
  previewCardKeys: readonly string[];
};

export const CARD_FACE_PACK_MANIFEST: readonly CardFacePackManifestEntry[] = [
  {
    id: "simple",
    label: "Simple",
    source: { type: "builtin", variant: "simple" },
    previewCardKeys: ["ace_of_spades", "king_of_hearts", "10_of_diamonds", "7_of_clubs"],
  },
  {
    id: "large-print",
    label: "Large Print",
    source: { type: "builtin", variant: "large-print" },
    previewCardKeys: ["ace_of_spades", "king_of_hearts", "10_of_diamonds", "7_of_clubs"],
  },
  {
    id: "default",
    label: "Royal Casino",
    source: { type: "local", folder: "default" },
    previewCardKeys: ["ace_of_spades", "king_of_hearts", "10_of_diamonds", "7_of_clubs"],
  },
  {
    id: "trippy",
    label: "AI Trippy",
    source: { type: "local", folder: "trippy" },
    previewCardKeys: ["ace_of_spades", "king_of_hearts", "10_of_diamonds", "7_of_clubs"],
  },
];

export function getCardFacePackById(id: string): CardFacePackManifestEntry | undefined {
  return CARD_FACE_PACK_MANIFEST.find((entry) => entry.id === id);
}

/** Card back packs: one image per pack (back.png in folder). Extra files in folder are ignored. */
export type CardBackPackSource = { type: "local"; folder: string };

export type CardBackPackManifestEntry = {
  id: string;
  label: string;
  source: CardBackPackSource;
};

export const CARD_BACK_PACK_MANIFEST: readonly CardBackPackManifestEntry[] = [
  { id: "red", label: "Red", source: { type: "local", folder: "backs/red" } },
  { id: "special", label: "Special", source: { type: "local", folder: "backs/special" } },
  { id: "standard", label: "Standard", source: { type: "local", folder: "backs/standard" } },
  { id: "normal", label: "Normal", source: { type: "local", folder: "backs/normal" } },
  { id: "vintage", label: "Vintage", source: { type: "local", folder: "backs/vintage" } },
];
