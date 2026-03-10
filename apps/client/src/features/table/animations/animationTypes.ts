/** Single canonical enum. No synonyms elsewhere. */
export type TableAnimationEvent = "POT_WIN" | "ALL_IN" | "SHOWDOWN";

/** The only thing game logic sends. Animation runtime never reads game state. */
export type TableAnimationRequest = {
  event: TableAnimationEvent;
  tier: 0 | 1 | 2 | 3 | 4;
  payload?: {
    headline?: string;
    amountCents?: number;
    potCents?: number;
    winnerSeat?: number;
    isHero?: boolean;
  };
};

/** Effects can originate from different parts of the table. */
export type AnimationAnchor = "TABLE_CENTER" | "HERO" | "SEAT";

/** Visual primitives, not poker concepts. */
export type AnimationLayerType = "FLASH" | "BURST" | "PARTICLES" | "RING" | "TEXT";

/** TEXT uses textRole to pick headline vs amount from payload. Particles have explicit schema. */
export type AnimationLayerDefinition = {
  type: AnimationLayerType;
  delayMs?: number;
  durationMs?: number;
  scale?: [number, number];
  opacity?: [number, number];
  rays?: number;
  particleCount?: number;
  particleSpread?: number;
  textRole?: "headline" | "amount";
  textSize?: "small" | "medium" | "large" | "xlarge";
  textGlow?: boolean;
};

/** Registry entry. Definitions are authoritative. */
export type TableAnimationDefinition = {
  event: TableAnimationEvent;
  tier: number;
  anchor: AnimationAnchor;
  durationMs: number;
  layers: AnimationLayerDefinition[];
};
