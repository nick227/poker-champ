/** True when no seated opponent still has chips to play the next hand. */
export function needsOpponentToContinue(opponents: Array<{ stackCents?: number | null }>): boolean {
  return opponents.every((o) => (o.stackCents ?? 0) <= 0);
}
