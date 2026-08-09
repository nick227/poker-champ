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

export const STAGE_LAYOUT_NORM = Object.freeze({
  MIN_SEATS: 2,
  MAX_SEATS: 9,
  /** Inset felt oval (~3–4% pad → ~94% fill). */
  felt: { x: 0.03, y: 0.04, w: 0.94, h: 0.92 } satisfies NormRect,
  /** Seat rail ellipse (centers); outside board, on cushion. */
  rail: { cx: 0.5, cy: 0.52, rx: 0.44, ry: 0.4 },
  /** Community / pot safe zone — only board + FX. */
  board: { x: 0.28, y: 0.34, w: 0.44, h: 0.3 } satisfies NormRect,
  /** Plate size as fraction of min(stageW, stageH). */
  plateW: 0.155,
  plateH: 0.092,
  plateMinW: 96,
  plateMaxW: 148,
  cardScale: 0.4,
  /** Extra host height above plate for hole-card fan (px after scale). */
  cardsExtraFrac: 0.35,
} as const);

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
  const m = Math.min(stage.width, stage.height);
  const width = clamp(
    m * STAGE_LAYOUT_NORM.plateW,
    STAGE_LAYOUT_NORM.plateMinW,
    STAGE_LAYOUT_NORM.plateMaxW,
  );
  const height = clamp(
    m * STAGE_LAYOUT_NORM.plateH,
    STAGE_LAYOUT_NORM.plateMinW * 0.55,
    STAGE_LAYOUT_NORM.plateMaxW * 0.58,
  );
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
  const felt = projectRect(STAGE_LAYOUT_NORM.felt, stage);
  return {
    felt,
    board: projectRect(STAGE_LAYOUT_NORM.board, stage),
    plate,
    seats,
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

/** Defaults for SeatPlate when stage has not measured yet. */
export const SEAT_PLATE = Object.freeze({
  WIDTH: 128,
  HEIGHT: 76,
  AVATAR: 44,
  CARD_SCALE: STAGE_LAYOUT_NORM.cardScale,
} as const);
