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
 * GG-style composition:
 * - Felt is a smaller inset oval (dark void around it).
 * - Seat anchors sit on the outer rim (outside the green).
 * - Pods are card-tall; avatar straddles the rail.
 */
export const STAGE_LAYOUT_NORM = Object.freeze({
  MIN_SEATS: 2,
  MAX_SEATS: 9,
  /** Painted felt oval (smaller table — not stage-filling). */
  felt: { cx: 0.5, cy: 0.47, rx: 0.36, ry: 0.3 },
  /** Seat centers just outside felt edge (rim / void). */
  rail: { cx: 0.5, cy: 0.47, rx: 0.46, ry: 0.4 },
  /** Community + pot — clear center of felt. */
  board: { x: 0.2, y: 0.26, w: 0.6, h: 0.4 } satisfies NormRect,
  /** Pod width from min(stage). Tall enough for dominant hole cards. */
  plateFromStage: 0.26,
  plateMinW: 140,
  plateMaxW: 210,
  /** Compact host — content packs tight; no tall empty oval. */
  plateAspect: 1.05,
  heroCardScale: 1.08,
  oppCardScale: 0.9,
  avatarFrac: 0.3,
} as const);

function feltRectNorm(): NormRect {
  const { felt } = STAGE_LAYOUT_NORM;
  return {
    x: felt.cx - felt.rx,
    y: felt.cy - felt.ry,
    w: 2 * felt.rx,
    h: 2 * felt.ry,
  };
}

export const STAGE_LAYOUT_FELT_NORM = feltRectNorm();

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
    m * STAGE_LAYOUT_NORM.plateFromStage,
    STAGE_LAYOUT_NORM.plateMinW,
    STAGE_LAYOUT_NORM.plateMaxW,
  );
  const height = Math.round(width * STAGE_LAYOUT_NORM.plateAspect);
  return { width: Math.round(width), height };
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
  heroCardScale: number;
  oppCardScale: number;
  avatarSize: number;
};

export function resolveStageLayout(maxSeats: number, stage: StageSize): ResolvedStageLayout {
  const n = clampMaxSeats(maxSeats);
  const plate = platePixelSize(stage);
  const halfW = plate.width / 2;
  const halfH = plate.height / 2;
  const seats: SeatAnchor[] = [];
  for (let i = 0; i < n; i++) {
    const p = projectPoint(seatAnchorNorm(i, n), stage);
    seats.push({
      slotIndex: i,
      x: clamp(p.x, halfW, stage.width - halfW),
      y: clamp(p.y, halfH * 0.55, stage.height - halfH * 0.45),
    });
  }
  const felt = projectRect(STAGE_LAYOUT_FELT_NORM, stage);
  return {
    felt,
    board: projectRect(STAGE_LAYOUT_NORM.board, stage),
    plate,
    seats,
    feltRadius: Math.min(felt.w, felt.h) / 2,
    heroCardScale: STAGE_LAYOUT_NORM.heroCardScale,
    oppCardScale: STAGE_LAYOUT_NORM.oppCardScale,
    avatarSize: Math.round(plate.width * STAGE_LAYOUT_NORM.avatarFrac),
  };
}

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
  WIDTH: 168,
  HEIGHT: 205,
  AVATAR: 50,
  CARD_SCALE: STAGE_LAYOUT_NORM.heroCardScale,
} as const);
