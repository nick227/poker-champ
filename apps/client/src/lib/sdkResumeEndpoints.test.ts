import { describe, expect, it } from "vitest";
import { tables, tournaments } from "@poker-champ/sdk";
import type { components, paths } from "@poker-champ/sdk";

type CashResumePath = paths["/api/tables/{tableId}/resume"]["post"];
type EnsurePath = paths["/api/tournaments/{id}/ensure-table"]["post"];

describe("SDK resume endpoints", () => {
  it("exports tables.resume and tournaments.ensureTable", () => {
    expect(typeof tables.resume).toBe("function");
    expect(typeof tournaments.ensureTable).toBe("function");
  });

  it("includes cash and tournament resume schemas", () => {
    const _cash: components["schemas"]["CashTableResumeResult"] = {
      tableId: "t1",
      roomId: "r1",
      tableLive: true,
      resumeStatus: "READY",
      playerStatus: "SEATED",
    };
    const _ensure: components["schemas"]["TournamentEnsureTableResult"] = {
      tournamentId: "tr1",
      tournamentStatus: "RUNNING",
      playerStatus: "ACTIVE",
      tableId: "t1",
      roomId: "r1",
      tableLive: true,
      joinStatus: "READY",
      tournament: {
        id: "tr1",
        name: "Test",
        status: "RUNNING",
        entryFeeCents: 0,
        prizePoolCents: 0,
        startTime: new Date().toISOString(),
        maxPlayers: 9,
        startingStackCents: 1000,
        blindStructureId: "default",
        lateRegMinutes: 0,
        currentLevel: 1,
        registeredCount: 0,
        fillBotsAtStart: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
    const _cashPath: CashResumePath = {} as CashResumePath;
    const _ensurePath: EnsurePath = {} as EnsurePath;
    expect(_cash.tableId).toBe("t1");
    expect(_ensure.tournamentId).toBe("tr1");
    expect(_cashPath).toBeDefined();
    expect(_ensurePath).toBeDefined();
  });
});
