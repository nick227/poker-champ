/** Single source of truth for procedural (code-rendered) card back patterns. */
/** HSL format: "H S% L%" (e.g. "217 50% 22%"). Background = card base; pattern = shapes (lighter/darker derived in render). */

export type CardBackPatternHsl = string;

export const PROCEDURAL_CARD_BACK_PATTERNS = [
  { id: "classic", name: "Classic", icon: "♦", background: "217 50% 22%", pattern: "217 50% 35%" },
  { id: "geometric", name: "Geometric", icon: "▲", background: "340 55% 28%", pattern: "340 45% 45%" },
  { id: "ornate", name: "Ornate", icon: "✦", background: "260 35% 20%", pattern: "260 30% 38%" },
  { id: "minimal", name: "Minimal", icon: "■", background: "0 0% 18%", pattern: "0 0% 28%" },
  { id: "gradient", name: "Gradient", icon: "▬", background: "220 40% 18%", pattern: "220 35% 32%" },
] as const;

export type CardBackPatternId = (typeof PROCEDURAL_CARD_BACK_PATTERNS)[number]["id"];
export const DEFAULT_CARD_BACK_PATTERN_ID: CardBackPatternId = "classic";

export type ProceduralCardBackEntry = (typeof PROCEDURAL_CARD_BACK_PATTERNS)[number];

export function getProceduralCardBackById(
  id: CardBackPatternId,
): ProceduralCardBackEntry | undefined {
  return PROCEDURAL_CARD_BACK_PATTERNS.find((p) => p.id === id);
}
