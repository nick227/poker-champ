/** Normalized (0..1) stage layout — pixels only via project / resolveStageLayout. */

export type StageSize = { width: number; height: number };
export type NormPoint = { x: number; y: number };
export type NormRect = { x: number; y: number; w: number; h: number };
export type PixelPoint = { x: number; y: number };
export type PixelRect = { x: number; y: number; w: number; h: number };
export type PixelSize = { width: number; height: number };

export type SeatAnchor = {
  slotIndex: number;
  x: number;
  y: number;
};

/**
 * Authoring units in stage space.
 * Play oval = clear center; rail = seat centers outside play; felt = rail bbox + pad.
 */
export const STAGE_LAYOUT_NORM = Object.freeze({
  MIN_SEATS: 2,
  MAX_SEATS: 9,
  /** Clear play oval (board/pot/chips only) — seats stay outside. */
  play: { cx: 0.5, cy: 0.49, rx: 0.36, ry: 0.3 },
  /**
   * Seat rail — outside play. South (hero) lands ~0.88 so HUD has air.
   * Same ellipse family as felt silhouette (felt = rail bbox + pad).
   */
  rail: { cx: 0.5, cy: 0.49, rx: 0.46, ry: 0.39 },
  /** Pad around rail bbox → painted felt oval. */
  feltPad: 0.025,
  /** Community / pot safe zone inside play. */
  board: { x: 0.26, y: 0.3, w: 0.48, h: 0.34 } satisfies NormRect,
  /** Plate width as fraction of min(feltW, feltH). */
  plateFromFelt: 0.175,
  plateMinW: 100,
  plateMaxW: 168,
  cardScale: 0.38,
  cardsExtraFrac: 0.32,
} as const);

function feltNormFromRail(): NormRect {
  const { rail, feltPad } = STAGE_LAYOUT_NORM;
  return {
    x: rail.cx - rail.rx - feltPad,
    y: rail.cy - rail.ry - feltPad,
    w: 2 * (rail.rx + feltPad),
    h: 2 * (rail.ry + feltPad),
  };
}

export const STAGE_LAYOUT_FELT_NORM = feltNormFromRail();

/** @deprecated use STAGE_LAYOUT_NORM */
export const STAGE_GEOMETRY = Object.freeze({
  MAX_SEATS: STAGE_LAYOUT_NORM.MAX_SEATS,
  MIN_SEATS: STAGE_LAYOUT_NORM.MIN_SEATS,
  RX_FRAC: STAGE_LAYOUT_NORM.rail.rx,
  RY_FRAC: STAGE_LAYOUT_NORM.rail.ry,
  SAFE_W_FRAC: STAGE_LAYOUT_NORM.board.w,
  SAFE_H_FRAC: STAGE_LAYOUT_NORM.board.h,
} as const);

export function clampMaxSeats(maxSeats: number): number {
  if (!Number.isFinite(maxSeats)) return 6;
  return Math.max(
    STAGE_LAYOUT_NORM.MIN_SEATS,
    Math.min(STAGE_LAYOUT_NORM.MAX_SEATS, Math.round(maxSeats)),
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function projectPoint(p: NormPoint, stage: StageSize): PixelPoint {
  return { x: p.x * stage.width, y: p.y * stage.height };
}

export function projectRect(r: NormRect, stage: StageSize): PixelRect {
  return {
    x: r.x * stage.width,
    y: r.y * stage.height,
    w: r.w * stage.width,
    h: r.h * stage.height,
  };
}

export function platePixelSize(stage: StageSize): PixelSize {
  const felt = projectRect(STAGE_LAYOUT_FELT_NORM, stage);
  const m = Math.min(felt.w, felt.h);
  const width = clamp(
    m * STAGE_LAYOUT_NORM.plateFromFelt,
    STAGE_LAYOUT_NORM.plateMinW,
    STAGE_LAYOUT_NORM.plateMaxW,
  );
  const height = clamp(width * 0.58, STAGE_LAYOUT_NORM.plateMinW * 0.52, STAGE_LAYOUT_NORM.plateMaxW * 0.58);
  return { width: Math.round(width), height: Math.round(height) };
}

/** Slot 0 = south (hero). Index increases clockwise (left of hero first). */
export function seatAnchorNorm(slotIndex: number, maxSeats: number): NormPoint {
  const n = clampMaxSeats(maxSeats);
  const { cx, cy, rx, ry } = STAGE_LAYOUT_NORM.rail;
  const theta = (slotIndex / n) * Math.PI * 2;
  return {
    x: cx - rx * Math.sin(theta),
    y: cy + ry * Math.cos(theta),
  };
}

export function seatAnchors(maxSeats: number, stage: StageSize): SeatAnchor[] {
  return resolveStageLayout(maxSeats, stage).seats;
}

export type ResolvedStageLayout = {
  felt: PixelRect;
  board: PixelRect;
  plate: PixelSize;
  seats: SeatAnchor[];
  /** Use as CSS 50%-equivalent ellipse clip radius (half of each axis via min). */
  feltRadius: number;
};

export function resolveStageLayout(maxSeats: number, stage: StageSize): ResolvedStageLayout {
  const n = clampMaxSeats(maxSeats);
  const plate = platePixelSize(stage);
  const halfW = plate.width / 2;
  const halfH = plate.height / 2 + plate.height * STAGE_LAYOUT_NORM.cardsExtraFrac;
  const seats: SeatAnchor[] = [];
  for (let i = 0; i < n; i++) {
    const p = projectPoint(seatAnchorNorm(i, n), stage);
    seats.push({
      slotIndex: i,
      x: clamp(p.x, halfW, stage.width - halfW),
      y: clamp(p.y, halfH, stage.height - halfH),
    });
  }
  const felt = projectRect(STAGE_LAYOUT_FELT_NORM, stage);
  return {
    felt,
    board: projectRect(STAGE_LAYOUT_NORM.board, stage),
    plate,
    seats,
    // Half-min → stadium/ellipse clip aligned to felt bbox of the rail.
    feltRadius: Math.min(felt.w, felt.h) / 2,
  };
}

/**
 * Map opponents onto slot indices by real seat distance from hero.
 * Slot 0 is hero (always empty here). Gaps stay null.
 */
export function assignOpponentsToSlots<T extends { seat: number }>(
  opponents: readonly T[],
  maxSeats: number,
  heroSeat: number,
): Array<T | null> {
  const n = clampMaxSeats(maxSeats);
  const slots: Array<T | null> = Array.from({ length: n }, () => null);
  for (const opp of opponents) {
    const slot = ((opp.seat - heroSeat) % n + n) % n;
    if (slot === 0) continue;
    slots[slot] = opp;
  }
  return slots;
}

export const SEAT_PLATE = Object.freeze({
  WIDTH: 128,
  HEIGHT: 74,
  AVATAR: 44,
  CARD_SCALE: STAGE_LAYOUT_NORM.cardScale,
  CAPSULE_H: 52,
} as const);
