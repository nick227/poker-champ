/** Single canonical enum. No synonyms elsewhere. Use FX_EVENT.* in code. */
export type TableAnimationEvent = "POT_WIN" | "ALL_IN" | "SHOWDOWN";

export const FX_EVENT: Record<TableAnimationEvent, TableAnimationEvent> = {
  POT_WIN: "POT_WIN",
  ALL_IN: "ALL_IN",
  SHOWDOWN: "SHOWDOWN",
};

/** Request contract version; protects against breaking UI changes. */
export const TABLE_ANIMATION_REQUEST_VERSION = 1;

/** The only thing game logic sends. Animation runtime never reads game state. */
export type TableAnimationRequest = {
  version?: typeof TABLE_ANIMATION_REQUEST_VERSION;
  event: TableAnimationEvent;
  tier: 0 | 1 | 2 | 3 | 4;
  payload?: {
    headline?: string;
    amountCents?: number;
    potCents?: number;
    winnerSeat?: number;
    isHero?: boolean;
    /** Future: seat-based anchor coordinates. */
    anchorSeat?: number;
  };
};

/** Global kill switch: accessibility, low-end devices, debugging. */
export type AnimationSettings = {
  enabled: boolean;
  reducedMotion: boolean;
};

/** Effects can originate from different parts of the table. */
export type AnimationAnchor = "TABLE_CENTER" | "HERO" | "SEAT";

export const FX_ANCHOR: Record<AnimationAnchor, AnimationAnchor> = {
  TABLE_CENTER: "TABLE_CENTER",
  HERO: "HERO",
  SEAT: "SEAT",
};

/** Visual primitives and asset layer. */
export type AnimationLayerType = "FLASH" | "BURST" | "PARTICLES" | "RING" | "TEXT" | "ASSET";

export type AnimationAssetType = "VIDEO" | "LOTTIE" | "SPRITE";

/** Procedural layer (code-driven). */
export type ProceduralLayerDefinition = {
  type: "FLASH" | "BURST" | "PARTICLES" | "RING" | "TEXT";
  delayMs?: number;
  durationMs?: number;
  scale?: [number, number];
  opacity?: [number, number];
  rays?: number;
  particleCount?: number;
  particleSpread?: number;
  /** PARTICLES only: offset of origin from center (e.g. from headline). */
  originOffsetX?: number;
  originOffsetY?: number;
  textRole?: "headline" | "amount";
  textSize?: "small" | "medium" | "large" | "xlarge";
  textGlow?: boolean;
};

/** External media layer (video, Lottie, sprite). durationMs undefined = use asset intrinsic duration. */
export type AssetLayerDefinition = {
  type: "ASSET";
  assetType: AnimationAssetType;
  source: string;
  variant?: string;
  containsAudio?: boolean;
  delayMs?: number;
  durationMs?: number;
  /** When true, overlay can preload this asset on mount to avoid first-play hitch. */
  preload?: boolean;
};

/** Animations compete only within the same channel; different channels run concurrently. */
export type AnimationChannel = "TABLE" | "SEAT" | "HERO" | "GLOBAL";

export const FX_CHANNEL: Record<AnimationChannel, AnimationChannel> = {
  TABLE: "TABLE",
  SEAT: "SEAT",
  HERO: "HERO",
  GLOBAL: "GLOBAL",
};

export type AnimationLayerDefinition = ProceduralLayerDefinition | AssetLayerDefinition;

/** Sound cue on definition; played when animation starts (after delayMs). */
export type SoundCue = {
  sound: string;
  delayMs?: number;
  volume?: number;
};

/** Registry entry. Definitions are authoritative. (event, tier) must be unique in registry. */
export type TableAnimationDefinition = {
  id: string;
  event: TableAnimationEvent;
  tier: number;
  channel: AnimationChannel;
  anchor: AnimationAnchor;
  durationMs: number;
  layers: AnimationLayerDefinition[];
  sounds?: SoundCue[];
};
