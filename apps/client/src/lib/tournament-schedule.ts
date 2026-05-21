/** Mirrors server default: first two 8-minute levels. */
export function defaultLateRegMinutesForStructure(structureId: string): number {
  if (structureId === "standard_8min") return 16;
  return 16;
}

export function lateRegCloseMs(tournament: {
  startTime: string;
  lateRegMinutes: number;
}): number {
  return new Date(tournament.startTime).getTime() + tournament.lateRegMinutes * 60 * 1000;
}

export function isLateRegistrationOpen(
  tournament: { startTime: string; lateRegMinutes: number; status: string },
  nowMs: number = Date.now(),
): boolean {
  if (tournament.lateRegMinutes <= 0) return false;
  if (tournament.status === "REGISTERING") return true;
  if (tournament.status === "LATE_REG" || tournament.status === "RUNNING") {
    return nowMs < lateRegCloseMs(tournament);
  }
  return false;
}
