import { describe, expect, it, vi, beforeEach } from "vitest";
import { SnapshotService } from "./SnapshotService.js";
import { PokerState } from "../../../state/PokerState.js";

const { findUnique, count, findFirst } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  count: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("@poker-champ/db", () => ({
  getPrisma: () => ({
    tournamentRegistration: { findUnique },
    tournament: { findUnique },
    balanceTransaction: { findFirst, count },
  }),
}));

describe("SnapshotService tournament viewer", () => {
  beforeEach(() => {
    findUnique.mockReset();
    count.mockReset();
    findFirst.mockReset();
    count.mockResolvedValue(1);
    findFirst.mockResolvedValue(null);
  });

  it("includes tournamentViewer on lightweight WAITING SEAT_CHANGE snapshots", async () => {
    const state = new PokerState();
    state.tableId = "table_tournament_viewer";
    state.street = "WAITING";
    state.handId = "";
    state.maxSeats = 6;
    state.smallBlindCents = 25;
    state.bigBlindCents = 50;
    state.minBuyInCents = 500;
    state.maxBuyInCents = 50_000;
    state.tournamentMode = true;
    state.tableName = "Tournament Table";
    state.seats.length = 0;
    for (let i = 0; i < state.maxSeats; i += 1) {
      state.seats.push("");
    }

    findUnique.mockImplementation(async (args: { where: { id?: string; tournamentId_userId?: { tournamentId: string; userId: string } } }) => {
      if (args.where.tournamentId_userId) {
        return {
          finishPlace: 7,
          rebuyPendingAt: null,
          eliminatedAt: new Date("2026-05-24T00:00:00.000Z"),
        };
      }
      return {
        playFormat: "FREEZEOUT",
        startTime: new Date("2026-05-24T00:00:00.000Z"),
        rebuyPeriodMinutes: 0,
        maxRebuysPerPlayer: 0,
        status: "RUNNING",
      };
    });

    const client = { send: vi.fn() };
    const snapshotService = new SnapshotService({
      state,
      clientsByUserId: new Map([["hero_user", client as never]]),
      getHoleCardsByPlayerId: () => new Map(),
      getHeroActionOptions: () => ({
        canFold: false,
        canCheck: false,
        canCall: false,
        canBet: false,
        canRaise: false,
        canAllIn: false,
        primaryWagerAction: "NONE",
        callAmount: 0,
      }),
      getResolvedActionId: () => undefined,
      getLastAction: () => undefined,
      getLastHandResult: () => undefined,
      getTurnTimeoutTotalMs: () => 20 * 60_000,
      getTournamentTableOverlay: () => ({
        tournamentId: "tourney_1",
        status: "RUNNING",
        currentLevel: 1,
        smallBlindCents: 25,
        bigBlindCents: 50,
        anteCents: 0,
        nextLevelAtTs: null,
        playFormat: "FREEZEOUT",
      }),
    });

    await snapshotService.emitToUser("hero_user", "SEAT_CHANGE");

    const payload = client.send.mock.calls.find((call) => call[0] === "TABLE_SNAPSHOT")?.[1];
    expect(payload).toBeDefined();
    expect(payload.reason).toBe("SEAT_CHANGE");
    expect(payload.hero.youAreSeated).toBe(false);
    expect(payload.hero.tournamentViewer).toMatchObject({
      isEliminated: true,
      isWinner: false,
      finishPlace: 7,
    });
    expect(payload.hero.calculations).toBeUndefined();
  });

  it("surfaces movedToTableNumber for an otherwise-active (not eliminated/finished/rebuy-pending) player after a table-balance move", async () => {
    const state = new PokerState();
    state.tableId = "table_tournament_viewer_moved";
    state.street = "WAITING";
    state.handId = "";
    state.maxSeats = 6;
    state.smallBlindCents = 25;
    state.bigBlindCents = 50;
    state.minBuyInCents = 500;
    state.maxBuyInCents = 50_000;
    state.tournamentMode = true;
    state.tableName = "Tournament Table";
    state.seats.length = 0;
    for (let i = 0; i < state.maxSeats; i += 1) {
      state.seats.push("");
    }

    findUnique.mockImplementation(async (args: { where: { id?: string; tournamentId_userId?: { tournamentId: string; userId: string } } }) => {
      if (args.where.tournamentId_userId) {
        // Active registrant: no finishPlace, no rebuyPendingAt, no eliminatedAt.
        return { finishPlace: null, rebuyPendingAt: null, eliminatedAt: null };
      }
      return {
        playFormat: "FREEZEOUT",
        startTime: new Date("2026-05-24T00:00:00.000Z"),
        rebuyPeriodMinutes: 0,
        maxRebuysPerPlayer: 0,
        status: "RUNNING",
      };
    });

    const client = { send: vi.fn() };
    const snapshotService = new SnapshotService({
      state,
      clientsByUserId: new Map([["hero_user", client as never]]),
      getHoleCardsByPlayerId: () => new Map(),
      getHeroActionOptions: () => ({
        canFold: false,
        canCheck: false,
        canCall: false,
        canBet: false,
        canRaise: false,
        canAllIn: false,
        primaryWagerAction: "NONE",
        callAmount: 0,
      }),
      getResolvedActionId: () => undefined,
      getLastAction: () => undefined,
      getLastHandResult: () => undefined,
      getTurnTimeoutTotalMs: () => 20 * 60_000,
      getTournamentTableOverlay: () => ({
        tournamentId: "tourney_1",
        status: "RUNNING",
        currentLevel: 1,
        smallBlindCents: 25,
        bigBlindCents: 50,
        anteCents: 0,
        nextLevelAtTs: null,
        playFormat: "FREEZEOUT",
      }),
      getMovedToTableNumber: (userId) => (userId === "hero_user" ? 3 : undefined),
    });

    await snapshotService.emitToUser("hero_user", "SEAT_CHANGE");

    const payload = client.send.mock.calls.find((call) => call[0] === "TABLE_SNAPSHOT")?.[1];
    expect(payload).toBeDefined();
    expect(payload.hero.tournamentViewer).toMatchObject({
      isEliminated: false,
      isWinner: false,
      finishPlace: null,
      movedToTableNumber: 3,
    });
  });
});
