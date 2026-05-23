import { getBlindLevels } from "./blind-structure.js";

/** Default late reg = first two blind levels (e.g. 16 min on standard_8min). */
export function defaultLateRegMinutesForStructure(structureId: string): number {
  const levels = getBlindLevels(structureId);
  const firstTwo = levels.slice(0, 2);
  return firstTwo.reduce((sum, level) => sum + level.durationMinutes, 0);
}

/** Default rebuy window = first four blind levels. */
export function defaultRebuyPeriodMinutesForStructure(structureId: string): number {
  const levels = getBlindLevels(structureId);
  const firstFour = levels.slice(0, 4);
  return firstFour.reduce((sum, level) => sum + level.durationMinutes, 0);
}

export function floorToMinute(date: Date): Date {
  const floored = new Date(date);
  floored.setSeconds(0, 0);
  return floored;
}

export function isTournamentStartInPast(startTime: Date, now: Date = new Date()): boolean {
  return floorToMinute(startTime).getTime() < floorToMinute(now).getTime();
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
  if (tournament.status === "REGISTERING") {
    if (now.getTime() < tournament.startTime.getTime()) return true;
    if (tournament.lateRegMinutes <= 0) return false;
    return now.getTime() < lateRegCloseMs(tournament);
  }
  if (tournament.lateRegMinutes <= 0) return false;
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

export function canRegisterForTournament(
  tournament: { startTime: Date; lateRegMinutes: number; status: string },
  now: Date = new Date(),
): boolean {
  return isLateRegistrationOpen(tournament, now);
}

export function canUnregisterFromTournament(
  tournament: { startTime: Date; status: string },
  now: Date = new Date(),
): boolean {
  return tournament.status === "REGISTERING" && now.getTime() < tournament.startTime.getTime();
}

export function canRebuyTournament(
  tournament: {
    playFormat: string;
    startTime: Date;
    rebuyPeriodMinutes: number;
    maxRebuysPerPlayer: number;
  },
  registration: { rebuyCount?: number | null } | null | undefined,
  now: Date = new Date(),
): boolean {
  if (tournament.playFormat !== "REBUY") return false;
  if (!registration) return false;
  if (tournament.rebuyPeriodMinutes <= 0) return false;
  if ((registration.rebuyCount ?? 0) >= tournament.maxRebuysPerPlayer) return false;

  const rebuyCloseMs = tournament.startTime.getTime() + tournament.rebuyPeriodMinutes * 60 * 1000;
  return now.getTime() < rebuyCloseMs;
}
