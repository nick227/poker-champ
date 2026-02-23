import type { PlayerState } from "../../../state/PlayerState.js";

export type HandHistoryRosterEntry = {
  id: string;
  name: string;
  seat: number;
  userId: string | null;
};

/** Minimal interface so both Map and Colyseus MapSchema are accepted. */
interface PlayersByIdLike {
  values(): IterableIterator<PlayerState>;
}

/**
 * Full table roster for HandHistoryService (must include all seated players so resolvePlayerId works).
 */
export function buildHandHistoryRoster(playersById: PlayersByIdLike): HandHistoryRosterEntry[] {
  return [...playersById.values()]
    .filter((pl) => pl.seat >= 0)
    .map((pl) => ({
      id: pl.id,
      name: pl.name,
      seat: pl.seat,
      userId: pl.kind === "HUMAN" ? pl.userId || pl.id : null,
    }));
}
