import { asObject } from "./utils/objectHelpers.js";

const HERO_USER_ID = "hero_user";
const OPPONENT_USER_ID_PREFIX = "lesson_user_";

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asSeatNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function buildUniqueUserId(base: string, seen: Set<string>): string {
  if (!seen.has(base)) return base;
  let suffix = 2;
  while (seen.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

export function repairLessonSnapshot(snapshotJson: unknown): unknown {
  const snapshot = asObject(snapshotJson);
  if (!snapshot) return snapshotJson;

  const hero = asObject(snapshot.hero);
  const rawSeats = Array.isArray(snapshot.seats) ? snapshot.seats.map((seat) => asObject(seat)) : null;
  if (!hero || !rawSeats) return snapshotJson;

  const heroSeat = asSeatNumber(hero.seat);
  if (heroSeat == null) return snapshotJson;

  const occupiedSeats = rawSeats.filter((seat): seat is Record<string, unknown> => Boolean(seat?.occupied));
  const occupiedUserIds = occupiedSeats.map((seat) => asNonEmptyString(seat.userId)).filter((id): id is string => Boolean(id));
  const hasDuplicateOccupiedUserIds = new Set(occupiedUserIds).size !== occupiedUserIds.length;

  const heroSeatRecord = rawSeats.find((seat) => asSeatNumber(seat?.seat) === heroSeat) ?? null;
  const currentHeroUserId = asNonEmptyString(hero.userId);
  const heroSeatUserId = asNonEmptyString(heroSeatRecord?.userId);
  const heroIdentityMismatch =
    !currentHeroUserId ||
    !heroSeatRecord ||
    heroSeatRecord.occupied !== true ||
    heroSeatUserId !== currentHeroUserId;

  if (!hasDuplicateOccupiedUserIds && !heroIdentityMismatch) {
    return snapshotJson;
  }

  const repairedSeats = rawSeats.map((seat) => ({ ...seat }));
  const repairedHero = { ...hero };
  const repairedSnapshot: Record<string, unknown> = {
    ...snapshot,
    hero: repairedHero,
    seats: repairedSeats,
  };

  const repairedHeroSeat = repairedSeats.find((seat) => asSeatNumber(seat.seat) === heroSeat) ?? null;
  const heroUserIdCandidate = currentHeroUserId ?? heroSeatUserId;
  const heroUserIdDuplicatedElsewhere = occupiedSeats.some(
    (seat) => asSeatNumber(seat.seat) !== heroSeat && asNonEmptyString(seat.userId) === heroUserIdCandidate,
  );
  const repairedHeroUserId =
    heroUserIdCandidate && !heroUserIdDuplicatedElsewhere ? heroUserIdCandidate : HERO_USER_ID;

  repairedHero.userId = repairedHeroUserId;
  if (repairedHeroSeat) {
    repairedHeroSeat.userId = repairedHeroUserId;
  }

  const seenUserIds = new Set<string>([repairedHeroUserId]);
  for (const seat of repairedSeats) {
    if (seat.occupied !== true) continue;
    const seatNumber = asSeatNumber(seat.seat);
    if (seatNumber === heroSeat) continue;
    const currentSeatUserId = asNonEmptyString(seat.userId);
    const fallbackUserId = `${OPPONENT_USER_ID_PREFIX}${seatNumber ?? "unknown"}`;
    const nextUserId = buildUniqueUserId(currentSeatUserId ?? fallbackUserId, seenUserIds);
    seat.userId = nextUserId;
    seenUserIds.add(nextUserId);
  }

  return repairedSnapshot;
}
