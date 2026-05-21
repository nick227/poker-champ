import { getBlindLevels } from "./blind-structure.js";

/** Default late reg = first two blind levels (e.g. 16 min on standard_8min). */
export function defaultLateRegMinutesForStructure(structureId: string): number {
  const levels = getBlindLevels(structureId);
  const firstTwo = levels.slice(0, 2);
  return firstTwo.reduce((sum, level) => sum + level.durationMinutes, 0);
}

export function lateRegCloseMs(tournament: {
  startTime: Date;
  lateRegMinutes: number;
}): number {
  return tournament.startTime.getTime() + tournament.lateRegMinutes * 60 * 1000;
}

export function isLateRegistrationOpen(
  tournament: { startTime: Date; lateRegMinutes: number; status: string },
  now: Date = new Date(),
): boolean {
  if (tournament.lateRegMinutes <= 0) return false;
  if (tournament.status === "REGISTERING") return true;
  if (tournament.status === "LATE_REG" || tournament.status === "RUNNING") {
    return now.getTime() < lateRegCloseMs(tournament);
  }
  return false;
}

export function isLateRegistrationClosed(
  tournament: { startTime: Date; lateRegMinutes: number },
  now: Date = new Date(),
): boolean {
  return tournament.lateRegMinutes > 0 && now.getTime() >= lateRegCloseMs(tournament);
}
