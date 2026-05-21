import { describe, expect, it } from "vitest";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { isTournamentEliminatedSpectator } from "./tournament-spectator";

function baseSnapshot(overrides: Partial<TableSnapshotPayload> = {}): TableSnapshotPayload {
  return {
    snapshotSeq: 1,
    serverTimeTs: 1,
    stateHash: "h",
    reason: "JOIN",
    table: {
      tableId: "t1",
      tableName: "T",
      smallBlindCents: 50,
      bigBlindCents: 100,
      minBuyInCents: 1000,
      maxBuyInCents: 1000,
      tournament: {
        tournamentId: "trn1",
        status: "RUNNING",
        currentLevel: 1,
        smallBlindCents: 50,
        bigBlindCents: 100,
        anteCents: 0,
      },
    },
    seats: [],
    hero: {
      userId: "u1",
      youAreSeated: false,
    },
    ...overrides,
  } as TableSnapshotPayload;
}

describe("isTournamentEliminatedSpectator", () => {
  it("is true when tournament overlay marks eliminated viewer", () => {
    const snapshot = baseSnapshot({
      hero: {
        userId: "u1",
        youAreSeated: false,
        tournamentViewer: { isEliminated: true, finishPlace: 2, payoutCents: 0 },
      },
    });
    expect(isTournamentEliminatedSpectator(snapshot)).toBe(true);
  });

  it("is false for cash tables and active tournament players", () => {
    expect(isTournamentEliminatedSpectator(baseSnapshot({ table: { ...baseSnapshot().table, tournament: undefined } }))).toBe(
      false,
    );
    expect(
      isTournamentEliminatedSpectator(
        baseSnapshot({
          hero: { userId: "u1", youAreSeated: true, seat: 0 },
        }),
      ),
    ).toBe(false);
  });
});
