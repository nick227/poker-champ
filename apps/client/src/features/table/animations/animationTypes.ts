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
export type AnimationAnchor = "TABLE_CENTER" | "HERO" | "SEAT" | "BOARD" | "CARD";

export const FX_ANCHOR: Record<AnimationAnchor, AnimationAnchor> = {
  TABLE_CENTER: "TABLE_CENTER",
  HERO: "HERO",
  SEAT: "SEAT",
  BOARD: "BOARD",
  CARD: "CARD",
};

/** Bounds in overlay coordinates (e.g. from onLayout). Used to position HERO/SEAT effects. */
export type Rect = { x: number; y: number; width: number; height: number };

export type AnchorBounds = {
  hero?: Rect;
  seatByIndex?: Record<number, Rect>;
  board?: Rect;
  /** Indices 0..4 for community card slots (flop1, flop2, flop3, turn, river). Undefined = not yet measured. */
  cardSlots?: (Rect | undefined)[];
};

/** Which stacking plane the layer renders on. Default FOREGROUND when omitted. */
export type AnimationPlane = "BACKGROUND" | "FOREGROUND";

/** Visual primitives and asset layer. */
export type AnimationLayerType = "FLASH" | "BURST" | "RADIAL_GLOW" | "PARTICLES" | "RING" | "TEXT" | "STREAK" | "SEAT_GLOW" | "ASSET";

export type AnimationAssetType = "VIDEO" | "LOTTIE" | "SPRITE";

/** Particle shape for confetti/sparks variety. */
export type ParticleShape = "circle" | "square" | "line";

/** Payload keys used for SEAT anchor index (e.g. winnerSeat, anchorSeat). */
export type SeatIndexPayloadKey = "winnerSeat" | "anchorSeat";

/** Procedural layer (code-driven). */
export type ProceduralLayerDefinition = {
  type: "FLASH" | "BURST" | "RADIAL_GLOW" | "PARTICLES" | "RING" | "TEXT" | "STREAK" | "SEAT_GLOW";
  /** Named preset for visual defaults; merged at resolution (layer overrides preset). */
  preset?: string;
  /** Where to draw; default from definition.anchor. */
  anchor?: AnimationAnchor;
  /** For SEAT anchor: payload key for seat index (e.g. "winnerSeat"). */
  seatIndexFromPayload?: SeatIndexPayloadKey;
  /** Default FOREGROUND. Atmosphere layers use BACKGROUND (softer, behind table). */
  plane?: AnimationPlane;
  delayMs?: number;
  durationMs?: number;
  scale?: [number, number];
  opacity?: [number, number];
  rays?: number;
  particleCount?: number;
  particleSpread?: number;
  /** PARTICLES: shape for confetti/sparks. */
  particleShape?: ParticleShape;
  /** PARTICLES only: offset of origin from center (e.g. from headline or amount). */
  originOffsetX?: number;
  originOffsetY?: number;
  textRole?: "headline" | "amount";
  textSize?: "small" | "medium" | "large" | "xlarge" | "hero";
  textGlow?: boolean;
  /** STREAK only: number of diagonal lines. */
  streakCount?: number;
  /** STREAK only: angle in degrees. */
  streakAngleDeg?: number;
};

/** External media layer (video, Lottie, sprite). durationMs undefined = use asset intrinsic duration. */
export type AssetLayerDefinition = {
  type: "ASSET";
  /** Named preset for visual defaults; merged at resolution (layer overrides preset). */
  preset?: string;
  /** Where to draw; default from definition.anchor. */
  anchor?: AnimationAnchor;
  /** Default FOREGROUND. Background ambience (e.g. gold sweep) uses BACKGROUND. */
  plane?: AnimationPlane;
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
