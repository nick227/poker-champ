function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export function getSeatRetentionHours(): number {
  return parsePositiveInt(process.env.SEAT_RETENTION_HOURS, 12);
}

export function getSeatHardDeleteHours(): number {
  const soft = getSeatRetentionHours();
  const hard = parsePositiveInt(process.env.SEAT_HARD_DELETE_HOURS, 72);
  return hard < soft ? soft : hard;
}

export function getAutoActionHandCap(): number {
  // Note: Dealer uses in-memory player status "ABANDONED" for gameplay sit-out,
  // while persistence uses TableSeatSession.state "SEATED_SITTING_OUT".
  return parsePositiveInt(process.env.AUTO_ACTION_HAND_CAP, 3);
}
