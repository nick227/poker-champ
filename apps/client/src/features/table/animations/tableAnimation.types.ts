/** Effect id: which animation definition to run. */
export type TableAnimationEffectId = "potWin" | "allIn" | "showdown";

/** Request emitted by game logic; overlay consumes and renders. No UI imports at call site. */
export type TableAnimationRequest = {
  id: TableAnimationEffectId;
  tier: number;
  payload?: TableAnimationPayload;
};

export type TableAnimationPayload = {
  /** e.g. "YOU WIN", "ALL IN" */
  headline?: string;
  /** e.g. "$2,850" */
  amountText?: string;
  /** Pot size for tier/display. */
  potCents?: number;
};

/** Layer type in a definition. */
export type TableAnimationLayerType = "burst" | "particles" | "typography" | "amount" | "ring" | "flash";

export type TableAnimationLayerDef = {
  type: TableAnimationLayerType;
  zIndex: number;
  durationMs: number;
  delayMs?: number;
  /** Layer-specific params (e.g. scale, color key). */
  params?: Record<string, unknown>;
};

export type TableAnimationDefinition = {
  id: TableAnimationEffectId;
  tier: number;
  totalDurationMs: number;
  layers: TableAnimationLayerDef[];
};
