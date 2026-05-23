import { getBlindLevelsForPreset } from "@/lib/tournament-detail";

/** Mirrors server default: first two blind levels. */
export function defaultLateRegMinutesForStructure(structureId: string): number {
  const levels = getBlindLevelsForPreset(structureId);
  return levels.slice(0, 2).reduce((sum, level) => sum + level.durationMinutes, 0);
}

/** Mirrors server default: first four blind levels. */
export function defaultRebuyPeriodMinutesForStructure(structureId: string): number {
  const levels = getBlindLevelsForPreset(structureId);
  return levels.slice(0, 4).reduce((sum, level) => sum + level.durationMinutes, 0);
}

export function lateRegCloseMs(tournament: {
  startTime: string;
  lateRegMinutes: number;
}): number {
  return new Date(tournament.startTime).getTime() + tournament.lateRegMinutes * 60 * 1000;
}

/** Mirrors server `canRegisterForTournament` / `isLateRegistrationOpen`. */
export function isLateRegistrationOpen(
  tournament: { startTime: string; lateRegMinutes: number; status: string },
  nowMs: number = Date.now(),
): boolean {
  const startMs = new Date(tournament.startTime).getTime();
  if (tournament.status === "REGISTERING") {
    if (Number.isFinite(startMs) && nowMs < startMs) return true;
    if (tournament.lateRegMinutes <= 0) return false;
    return nowMs < lateRegCloseMs(tournament);
  }
  if (tournament.lateRegMinutes <= 0) return false;
  if (tournament.status === "LATE_REG" || tournament.status === "RUNNING") {
    return nowMs < lateRegCloseMs(tournament);
  }
  return false;
}
