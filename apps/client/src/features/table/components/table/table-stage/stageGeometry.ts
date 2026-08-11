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
  felt: { cx: 0.5, cy: 0.5, rx: 0.45, ry: 0.29 },
  /**
   * Seat anchors = felt edge + small pad so avatars straddle the rail.
   * Previous rail.ry (0.36 vs felt 0.22) left a huge void gap — keep this tight.
   */
  rail: { cx: 0.5, cy: 0.5, rx: 0.455, ry: 0.295 },
  /** Board sits in the flat center. */
  board: { x: 0.29, y: 0.355, w: 0.42, h: 0.29 } satisfies NormRect,
  /** Compact pod width. */
  plateFromStage: 0.205,
  plateMinW: 124,
  plateMaxW: 240,
  /** Avatar as fraction of plate width. */
  avatarFrac: 0.46,
  /** Nameplate under avatar. */
  nameplateH: 56,
  /** Cards overlay avatar — scale relative to base 70×90 card. */
  heroCardScale: 1.2,
  oppCardScale: 1.05,
  /** How much of the card height peeks above the avatar top. */
  /** Less empty shelf above the avatar — cards should sit on the face. */
  cardPeekFrac: 0.36,
  /** Keep pods fully on-screen. */
  stagePad: 10,
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
  const compact = stage.width < 700;
  const m = Math.min(stage.width, stage.height);
  const heroCardScale = compact ? 0.82 : STAGE_LAYOUT_NORM.heroCardScale;
  const avatarFrac = compact ? 0.44 : STAGE_LAYOUT_NORM.avatarFrac;
  const nameplateH = compact ? 40 : STAGE_LAYOUT_NORM.nameplateH;
  const width = clamp(
    Math.max(
      m * STAGE_LAYOUT_NORM.plateFromStage,
      stage.width * (compact ? 0.205 : 0.13),
    ),
    compact ? 76 : STAGE_LAYOUT_NORM.plateMinW,
    compact ? 104 : STAGE_LAYOUT_NORM.plateMaxW,
  );
  const avatar = Math.round(width * avatarFrac);
  const cardPeek = Math.round(
    BASE_CARD_HEIGHT * heroCardScale * STAGE_LAYOUT_NORM.cardPeekFrac,
  );
  const nameplateOverlap = compact ? 3 : 8;
  // Short GG pod: card peek + avatar + nameplate (cards do not stack full height).
  const height = cardPeek + avatar + nameplateH - nameplateOverlap + 4;
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
  const compact = stage.width < 700;
  const heroCardScale = compact ? 0.82 : STAGE_LAYOUT_NORM.heroCardScale;
  const oppCardScale = compact ? 0.72 : STAGE_LAYOUT_NORM.oppCardScale;
  const avatarFrac = compact ? 0.44 : STAGE_LAYOUT_NORM.avatarFrac;
  const nameplateH = compact ? 40 : STAGE_LAYOUT_NORM.nameplateH;
  const plate = platePixelSize(stage);
  const avatarSize = Math.round(plate.width * avatarFrac);
  const cardPeek = Math.round(
    BASE_CARD_HEIGHT * heroCardScale * STAGE_LAYOUT_NORM.cardPeekFrac,
  );
  // Anchor = avatar center on the rail.
  const avatarCenterFromTop = cardPeek + avatarSize / 2;
  const pad = STAGE_LAYOUT_NORM.stagePad;
  const halfW = plate.width / 2;

  // Resolve against a professional desktop table ratio rather than stretching
  // normalized Y values with the viewport. This keeps tall stages from
  // producing an oversized, empty felt.
  // Width is authoritative. The action HUD can make the stage shallow on
  // desktop; coupling width to that height recreates the narrow-table bug.
  const feltW = stage.width * 0.86;
  // Portrait mobile has much more spare stage height than a wide-oblong table can use at the
  // desktop aspect ratio. Lean into that instead of capping near-round: stretch the felt taller
  // than it is wide so it fills the vertical void and the rail has more room to carry extra
  // seats top-to-bottom, instead of leaving a big empty gap above/below a flat table.
  // Desktop: a real client's felt fills nearly the whole stage, leaving only a
  // thin void at the ends. 0.69 left a ~230px symmetric dead band above/below
  // the felt on 1440x900 and 1920x1080 stages; the width-aspect clause below
  // is the real ceiling once height stops starving it, so raise the height
  // budget and let /2.15 keep the oblong proportions in check.
  const feltH = compact
    ? Math.min(stage.height * 0.86, feltW * 1.35)
    : Math.min(stage.height * 0.82, feltW / 2.15);
  const felt: PixelRect = {
    x: (stage.width - feltW) / 2,
    y: (stage.height - feltH) / 2,
    w: feltW,
    h: feltH,
  };
  // Community cards should read as a moderate focal point, not dominate the felt -- keep the
  // reserved board box close to the card size a real table renders at (~25-28% of felt height).
  const boardWidthFraction = felt.w < 700 ? 0.78 : felt.w < 1300 ? 0.5 : 0.46;
  const boardW = felt.w * boardWidthFraction;
  const boardH = felt.h * (felt.w < 700 ? 0.4 : felt.w < 1300 ? 0.3 : 0.27);
  const board: PixelRect = {
    x: felt.x + (felt.w - boardW) / 2,
    y: felt.y + (felt.h - boardH) / 2,
    w: boardW,
    h: boardH,
  };
  const railCenterX = felt.x + felt.w / 2;
  const railCenterY = felt.y + felt.h / 2;
  // Put the avatar center just outside the cushion. The resulting pod overlap
  // is roughly 40%, matching the compact seat attachment in the reference.
  const seatOutset = avatarSize * 0.35;
  const railRx = felt.w / 2 + seatOutset;
  const railRy = felt.h / 2 + seatOutset;

  const seats: SeatAnchor[] = [];
  for (let i = 0; i < n; i++) {
    const theta = (i / n) * Math.PI * 2;
    const p = {
      x: railCenterX - railRx * Math.sin(theta),
      // Give the hero a little more breathing room from the board while still
      // keeping the avatar and cards attached to the south cushion.
      // Pull hero north of the HUD — never push south into the action bar.
      y:
        railCenterY +
        railRy * Math.cos(theta) -
        (i === 0 ? Math.min(14, stage.height * 0.025) : 0),
    };
    const x = clamp(p.x, halfW + pad, stage.width - halfW - pad);
    // Keep full pod (including nameplate below avatar) on-screen.
    const minY = pad + avatarCenterFromTop;
    // Hero needs real clearance above the control bar (nameplate must not clip).
    const bottomPad = i === 0 ? Math.max(22, Math.round(plate.height * 0.12)) : pad;
    const maxY = stage.height - bottomPad - (plate.height - avatarCenterFromTop);
    seats.push({
      slotIndex: i,
      x,
      y: clamp(p.y, minY, Math.max(minY, maxY)),
    });
  }

  return {
    felt,
    board,
    plate,
    seats,
    // Stadium ends for oblong felt (half of short axis).
    feltRadius: Math.min(felt.w, felt.h) / 2,
    heroCardScale,
    oppCardScale,
    avatarSize,
    cardPeek,
    nameplateH,
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
