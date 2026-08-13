/** Lobby money: always two decimals so $0.50 does not collapse to $0.5. */
export function formatLobbyUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Seat / field counts with the mockup's spaced slash: "6 / 9". */
export function formatLobbyCount(current: number, max: number): string {
  if (max <= 0) return "—";
  return `${current} / ${max}`;
}

/** Compact duration for lobby countdowns: "12 min", "1 h 12 min". */
export function formatLobbyDurationMs(ms: number): string | null {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalMin = Math.max(1, Math.round(ms / 60_000));
  if (totalMin < 60) return `${totalMin} min`;
  const hours = Math.floor(totalMin / 60);
  const rem = totalMin % 60;
  return rem === 0 ? `${hours} h` : `${hours} h ${rem} min`;
}
