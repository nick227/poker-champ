/** Normalized (0..1) stage layout — pixels only via project / resolveStageLayout. */

import { BASE_CARD_HEIGHT } from "../tokens/card-dimensions.tokens";

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
 * GG oblong table + compact rim seats.
 * Felt is wide/short; seat anchors sit on the cushion edge (not floating in void).
 */
export const STAGE_LAYOUT_NORM = Object.freeze({
  MIN_SEATS: 2,
  MAX_SEATS: 9,
  /** Flat oblong felt (wider than tall). */
  felt: { cx: 0.5, cy: 0.48, rx: 0.44, ry: 0.28 },
  /**
   * Seat anchors = felt edge + small pad so avatars straddle the rail.
   * Previous rail.ry (0.36 vs felt 0.22) left a huge void gap — keep this tight.
   */
  rail: { cx: 0.5, cy: 0.48, rx: 0.47, ry: 0.31 },
  /** Board sits in the flat center. */
  board: { x: 0.24, y: 0.34, w: 0.52, h: 0.28 } satisfies NormRect,
  /** Compact pod width. */
  plateFromStage: 0.2,
  plateMinW: 112,
  plateMaxW: 168,
  /** Avatar as fraction of plate width. */
  avatarFrac: 0.42,
  /** Nameplate under avatar. */
  nameplateH: 34,
  /** Cards overlay avatar — scale relative to base 70×90 card. */
  heroCardScale: 0.72,
  oppCardScale: 0.62,
  /** How much of the card height peeks above the avatar top. */
  cardPeekFrac: 0.38,
  /** Keep pods fully on-screen. */
  stagePad: 6,
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
  const avatar = Math.round(width * STAGE_LAYOUT_NORM.avatarFrac);
  const cardPeek = Math.round(
    BASE_CARD_HEIGHT * STAGE_LAYOUT_NORM.heroCardScale * STAGE_LAYOUT_NORM.cardPeekFrac,
  );
  // Short GG pod: card peek + avatar + nameplate (cards do not stack full height).
  const height = cardPeek + avatar + STAGE_LAYOUT_NORM.nameplateH + 4;
  return { width: Math.round(width), height };
}

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
  cardPeek: number;
  nameplateH: number;
};

export function resolveStageLayout(maxSeats: number, stage: StageSize): ResolvedStageLayout {
  const n = clampMaxSeats(maxSeats);
  const plate = platePixelSize(stage);
  const avatarSize = Math.round(plate.width * STAGE_LAYOUT_NORM.avatarFrac);
  const cardPeek = Math.round(
    BASE_CARD_HEIGHT * STAGE_LAYOUT_NORM.heroCardScale * STAGE_LAYOUT_NORM.cardPeekFrac,
  );
  // Anchor = avatar center on the rail.
  const avatarCenterFromTop = cardPeek + avatarSize / 2;
  const pad = STAGE_LAYOUT_NORM.stagePad;
  const halfW = plate.width / 2;

  const seats: SeatAnchor[] = [];
  for (let i = 0; i < n; i++) {
    const p = projectPoint(seatAnchorNorm(i, n), stage);
    const x = clamp(p.x, halfW + pad, stage.width - halfW - pad);
    // Keep full pod (including nameplate below avatar) on-screen.
    const minY = pad + avatarCenterFromTop;
    const maxY = stage.height - pad - (plate.height - avatarCenterFromTop);
    seats.push({
      slotIndex: i,
      x,
      y: clamp(p.y, minY, Math.max(minY, maxY)),
    });
  }

  const felt = projectRect(STAGE_LAYOUT_FELT_NORM, stage);
  return {
    felt,
    board: projectRect(STAGE_LAYOUT_NORM.board, stage),
    plate,
    seats,
    // Stadium ends for oblong felt (half of short axis).
    feltRadius: Math.min(felt.w, felt.h) / 2,
    heroCardScale: STAGE_LAYOUT_NORM.heroCardScale,
    oppCardScale: STAGE_LAYOUT_NORM.oppCardScale,
    avatarSize,
    cardPeek,
    nameplateH: STAGE_LAYOUT_NORM.nameplateH,
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
  WIDTH: 128,
  HEIGHT: 110,
  AVATAR: 54,
  CARD_SCALE: STAGE_LAYOUT_NORM.heroCardScale,
} as const);
