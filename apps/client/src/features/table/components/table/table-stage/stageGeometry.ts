/** Fixed ellipse seat geometry — slots never rebuild when occupancy changes. */

export type StageSize = { width: number; height: number };

export type SeatAnchor = {
  /** 0 = hero (south); then counter-clockwise around the table. */
  slotIndex: number;
  /** Plate center X in stage coordinates. */
  x: number;
  /** Plate center Y in stage coordinates. */
  y: number;
};

export const STAGE_GEOMETRY = Object.freeze({
  MAX_SEATS: 9,
  MIN_SEATS: 2,
  /** Ellipse radii as fractions of stage size — seats sit on the rail, not over board. */
  RX_FRAC: 0.4,
  RY_FRAC: 0.38,
  /** Community/board safe zone (fraction of stage) — seats must stay outside. */
  SAFE_W_FRAC: 0.42,
  SAFE_H_FRAC: 0.3,
} as const);

export const SEAT_PLATE = Object.freeze({
  WIDTH: 128,
  HEIGHT: 76,
  AVATAR: 44,
  CARD_SCALE: 0.42,
} as const);

export function clampMaxSeats(maxSeats: number): number {
  if (!Number.isFinite(maxSeats)) return 6;
  return Math.max(STAGE_GEOMETRY.MIN_SEATS, Math.min(STAGE_GEOMETRY.MAX_SEATS, Math.round(maxSeats)));
}

/**
 * Seat anchors on an ellipse. Slot 0 is south (hero). Index increases clockwise
 * (left of hero first on screen) to match circular seat ordering from the adapter.
 */
export function seatAnchors(maxSeats: number, stage: StageSize): SeatAnchor[] {
  const n = clampMaxSeats(maxSeats);
  const cx = stage.width / 2;
  const cy = stage.height / 2;
  const rx = stage.width * STAGE_GEOMETRY.RX_FRAC;
  const ry = stage.height * STAGE_GEOMETRY.RY_FRAC;
  const anchors: SeatAnchor[] = [];
  for (let i = 0; i < n; i++) {
    const theta = (i / n) * Math.PI * 2;
    anchors.push({
      slotIndex: i,
      // Negate sin so i=1 sits left of hero (clockwise from south on screen).
      x: cx - rx * Math.sin(theta),
      y: cy + ry * Math.cos(theta),
    });
  }
  return anchors;
}

/** Assign circularly-ordered opponents (from hero) into slot indices 1..n-1. */
export function assignOpponentsToSlots<T>(
  opponents: readonly T[],
  maxSeats: number,
): Array<T | null> {
  const n = clampMaxSeats(maxSeats);
  const slots: Array<T | null> = Array.from({ length: n }, () => null);
  const capacity = n - 1;
  for (let i = 0; i < opponents.length && i < capacity; i++) {
    slots[i + 1] = opponents[i];
  }
  return slots;
}
