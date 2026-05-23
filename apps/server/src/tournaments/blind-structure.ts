import type { TournamentBlindStructureId } from "./tournament.constants.js";

export type BlindLevel = {
  level: number;
  smallBlindCents: number;
  bigBlindCents: number;
  anteCents: number;
  durationMinutes: number;
};

export const FAST_4MIN_LEVELS: BlindLevel[] = [
  { level: 1, smallBlindCents: 25, bigBlindCents: 50, anteCents: 0, durationMinutes: 4 },
  { level: 2, smallBlindCents: 50, bigBlindCents: 100, anteCents: 0, durationMinutes: 4 },
  { level: 3, smallBlindCents: 75, bigBlindCents: 150, anteCents: 0, durationMinutes: 4 },
  { level: 4, smallBlindCents: 100, bigBlindCents: 200, anteCents: 0, durationMinutes: 4 },
  { level: 5, smallBlindCents: 150, bigBlindCents: 300, anteCents: 0, durationMinutes: 4 },
  { level: 6, smallBlindCents: 200, bigBlindCents: 400, anteCents: 0, durationMinutes: 4 },
  { level: 7, smallBlindCents: 300, bigBlindCents: 600, anteCents: 0, durationMinutes: 4 },
  { level: 8, smallBlindCents: 400, bigBlindCents: 800, anteCents: 0, durationMinutes: 4 },
  { level: 9, smallBlindCents: 600, bigBlindCents: 1200, anteCents: 0, durationMinutes: 4 },
  { level: 10, smallBlindCents: 800, bigBlindCents: 1600, anteCents: 0, durationMinutes: 4 },
  { level: 11, smallBlindCents: 1000, bigBlindCents: 2000, anteCents: 0, durationMinutes: 4 },
  { level: 12, smallBlindCents: 1500, bigBlindCents: 3000, anteCents: 0, durationMinutes: 4 },
  { level: 13, smallBlindCents: 2000, bigBlindCents: 4000, anteCents: 0, durationMinutes: 4 },
  { level: 14, smallBlindCents: 3000, bigBlindCents: 6000, anteCents: 0, durationMinutes: 4 },
];

export const STANDARD_8MIN_LEVELS: BlindLevel[] = [
  { level: 1, smallBlindCents: 25, bigBlindCents: 50, anteCents: 0, durationMinutes: 8 },
  { level: 2, smallBlindCents: 50, bigBlindCents: 100, anteCents: 0, durationMinutes: 8 },
  { level: 3, smallBlindCents: 75, bigBlindCents: 150, anteCents: 0, durationMinutes: 8 },
  { level: 4, smallBlindCents: 100, bigBlindCents: 200, anteCents: 0, durationMinutes: 8 },
  { level: 5, smallBlindCents: 150, bigBlindCents: 300, anteCents: 0, durationMinutes: 8 },
  { level: 6, smallBlindCents: 200, bigBlindCents: 400, anteCents: 0, durationMinutes: 8 },
  { level: 7, smallBlindCents: 300, bigBlindCents: 600, anteCents: 0, durationMinutes: 8 },
  { level: 8, smallBlindCents: 400, bigBlindCents: 800, anteCents: 0, durationMinutes: 8 },
  { level: 9, smallBlindCents: 600, bigBlindCents: 1200, anteCents: 0, durationMinutes: 8 },
  { level: 10, smallBlindCents: 800, bigBlindCents: 1600, anteCents: 0, durationMinutes: 8 },
];

export const LONG_12MIN_LEVELS: BlindLevel[] = [
  { level: 1, smallBlindCents: 25, bigBlindCents: 50, anteCents: 0, durationMinutes: 12 },
  { level: 2, smallBlindCents: 50, bigBlindCents: 100, anteCents: 0, durationMinutes: 12 },
  { level: 3, smallBlindCents: 75, bigBlindCents: 150, anteCents: 0, durationMinutes: 12 },
  { level: 4, smallBlindCents: 100, bigBlindCents: 200, anteCents: 0, durationMinutes: 12 },
  { level: 5, smallBlindCents: 150, bigBlindCents: 300, anteCents: 0, durationMinutes: 12 },
  { level: 6, smallBlindCents: 200, bigBlindCents: 400, anteCents: 0, durationMinutes: 12 },
  { level: 7, smallBlindCents: 300, bigBlindCents: 600, anteCents: 0, durationMinutes: 12 },
  { level: 8, smallBlindCents: 400, bigBlindCents: 800, anteCents: 0, durationMinutes: 12 },
  { level: 9, smallBlindCents: 600, bigBlindCents: 1200, anteCents: 0, durationMinutes: 12 },
  { level: 10, smallBlindCents: 800, bigBlindCents: 1600, anteCents: 0, durationMinutes: 12 },
  { level: 11, smallBlindCents: 1000, bigBlindCents: 2000, anteCents: 0, durationMinutes: 12 },
  { level: 12, smallBlindCents: 1500, bigBlindCents: 3000, anteCents: 0, durationMinutes: 12 },
];

const PRESETS: Record<TournamentBlindStructureId, BlindLevel[]> = {
  fast_4min: FAST_4MIN_LEVELS,
  standard_8min: STANDARD_8MIN_LEVELS,
  long_12min: LONG_12MIN_LEVELS,
};

export function getBlindLevels(structureId: string): BlindLevel[] {
  const levels = PRESETS[structureId as TournamentBlindStructureId];
  if (!levels) {
    throw new Error(`UNKNOWN_BLIND_STRUCTURE:${structureId}`);
  }
  return levels;
}

export function getBlindLevel(structureId: string, level: number): BlindLevel {
  const levels = getBlindLevels(structureId);
  const row = levels.find((l) => l.level === level) ?? levels[levels.length - 1];
  return row;
}

export function getMaxBlindLevel(structureId: string): number {
  const levels = getBlindLevels(structureId);
  return levels[levels.length - 1].level;
}

export function computeNextLevelAt(from: Date, level: BlindLevel): Date {
  return new Date(from.getTime() + level.durationMinutes * 60 * 1000);
}
