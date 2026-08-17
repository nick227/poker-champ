import { beforeEach, describe, expect, it, vi } from "vitest";
import { resumeCashTableForUser } from "./cash-table-resume.js";

const mocks = vi.hoisted(() => ({
  findLiveCashRoomByTableId: vi.fn(),
  loadLivePokerRoomIds: vi.fn(),
  findRejoinableSession: vi.fn(),
  reapExpiredSessionsForTable: vi.fn(),
  prismaFindUnique: vi.fn(),
  playerBalanceFindUnique: vi.fn(),
  isPersistentSeatsEnabled: vi.fn(),
}));

vi.mock("./cash-table-room.js", () => ({
  findLiveCashRoomByTableId: mocks.findLiveCashRoomByTableId,
}));

vi.mock("../tournaments/tournament-room-live.js", () => ({
  loadLivePokerRoomIds: mocks.loadLivePokerRoomIds,
}));

vi.mock("../engine/seats/TableSeatSessionService.js", () => ({
  TableSeatSessionService: {
    findRejoinableSession: mocks.findRejoinableSession,
    reapExpiredSessionsForTable: mocks.reapExpiredSessionsForTable,
  },
}));

vi.mock("../config/features.js", () => ({
  isPersistentSeatsEnabled: mocks.isPersistentSeatsEnabled,
}));

vi.mock("@poker-champ/db", () => ({
  getPrisma: () => ({
    tableSeatSession: {
      findUnique: mocks.prismaFindUnique,
    },
    playerBalance: {
      findUnique: mocks.playerBalanceFindUnique,
    },
  }),
}));

describe("resumeCashTableForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isPersistentSeatsEnabled.mockReturnValue(true);
    mocks.reapExpiredSessionsForTable.mockResolvedValue({ softExpired: [], hardDeletedCount: 0 });
    // Default: an ACTIVE PlayerBalance backing whatever stackCentsSnapshot the test sets up, so
    // existing seat-session-only tests don't need to know about the balance cross-check unless
    // they're specifically testing it.
    mocks.playerBalanceFindUnique.mockImplementation(async () => ({ balanceCents: 999_999, status: "ACTIVE" }));
  });

  it("returns ENDED when no live cash room exists", async () => {
    mocks.findLiveCashRoomByTableId.mockResolvedValue(null);
    const result = await resumeCashTableForUser({ tableId: "table_x", userId: "u1" });
    expect(result.resumeStatus).toBe("ENDED");
    expect(result.tableLive).toBe(false);
  });

  it("returns ROOM_RECOVERED when stale room id differs from live room", async () => {
    mocks.findLiveCashRoomByTableId.mockResolvedValue({
      roomId: "room_new",
      tableId: "table_x",
      metadata: { minBuyInCents: 2000, maxBuyInCents: 20000 },
    });
    mocks.loadLivePokerRoomIds.mockResolvedValue(new Set(["room_new"]));
    mocks.prismaFindUnique.mockResolvedValue({
      state: "SEATED_ACTIVE",
      stackCentsSnapshot: 5000,
      buyInCents: 5000,
      disconnectAt: null,
    });

    const result = await resumeCashTableForUser({
      tableId: "table_x",
      userId: "u1",
      previousRoomId: "room_old",
    });

    expect(result.resumeStatus).toBe("ROOM_RECOVERED");
    expect(result.roomId).toBe("room_new");
    expect(result.playerStatus).toBe("SEATED");
  });

  it("returns READY for seated player with chips", async () => {
    mocks.findLiveCashRoomByTableId.mockResolvedValue({
      roomId: "room_1",
      tableId: "table_x",
      metadata: { minBuyInCents: 2000, maxBuyInCents: 20000 },
    });
    mocks.loadLivePokerRoomIds.mockResolvedValue(new Set(["room_1"]));
    mocks.prismaFindUnique.mockResolvedValue({
      state: "SEATED_ACTIVE",
      stackCentsSnapshot: 8000,
      buyInCents: 10000,
      disconnectAt: null,
    });

    const result = await resumeCashTableForUser({ tableId: "table_x", userId: "u1" });
    expect(result.resumeStatus).toBe("READY");
    expect(result.playerStatus).toBe("SEATED");
  });

  it("returns NEEDS_BUY_IN when stack is zero", async () => {
    mocks.findLiveCashRoomByTableId.mockResolvedValue({
      roomId: "room_1",
      tableId: "table_x",
      metadata: { minBuyInCents: 2000, maxBuyInCents: 20000 },
    });
    mocks.loadLivePokerRoomIds.mockResolvedValue(new Set(["room_1"]));
    mocks.prismaFindUnique.mockResolvedValue({
      state: "SEATED_SITTING_OUT",
      stackCentsSnapshot: 0,
      buyInCents: 10000,
      disconnectAt: new Date(),
    });

    const result = await resumeCashTableForUser({ tableId: "table_x", userId: "u1" });
    expect(result.resumeStatus).toBe("NEEDS_BUY_IN");
    expect(result.playerStatus).toBe("SEATED");
  });

  it("does not report a stale seat row as resumable once its balance is already CASHED_OUT", async () => {
    // Models a durable row that went stale: a cash-out succeeded (PlayerBalance -> CASHED_OUT)
    // but the follow-up markLeft failed to persist, so the row still claims SEATED_ACTIVE with
    // its old nonzero snapshot. This must never be reported as a resumable seat with phantom chips.
    mocks.findLiveCashRoomByTableId.mockResolvedValue({
      roomId: "room_1",
      tableId: "table_x",
      metadata: { minBuyInCents: 2000, maxBuyInCents: 20000 },
    });
    mocks.loadLivePokerRoomIds.mockResolvedValue(new Set(["room_1"]));
    mocks.prismaFindUnique.mockResolvedValue({
      state: "SEATED_ACTIVE",
      stackCentsSnapshot: 8000,
      buyInCents: 10000,
      disconnectAt: null,
    });
    mocks.playerBalanceFindUnique.mockResolvedValue({ balanceCents: 0, status: "CASHED_OUT" });

    const result = await resumeCashTableForUser({ tableId: "table_x", userId: "u1" });
    expect(result.resumeStatus).toBe("NOT_SEATED");
    expect(result.playerStatus).toBe("NOT_SEATED");
  });

  it("caps a stale-but-not-cashed-out snapshot at the live balance rather than trusting the row", async () => {
    // The row still says 8000, but the live ledger only backs 3000 (e.g. some of the stack was
    // legitimately debited since the snapshot was last synced). PlayerBalance wins.
    mocks.findLiveCashRoomByTableId.mockResolvedValue({
      roomId: "room_1",
      tableId: "table_x",
      metadata: { minBuyInCents: 2000, maxBuyInCents: 20000 },
    });
    mocks.loadLivePokerRoomIds.mockResolvedValue(new Set(["room_1"]));
    mocks.prismaFindUnique.mockResolvedValue({
      state: "SEATED_ACTIVE",
      stackCentsSnapshot: 8000,
      buyInCents: 10000,
      disconnectAt: null,
    });
    mocks.playerBalanceFindUnique.mockResolvedValue({ balanceCents: 3000, status: "ACTIVE" });

    const result = await resumeCashTableForUser({ tableId: "table_x", userId: "u1" });
    expect(result.resumeStatus).toBe("READY");
    expect(result.stackCentsSnapshot).toBe(3000);
  });

  it("returns NOT_SEATED when no seat session", async () => {
    mocks.findLiveCashRoomByTableId.mockResolvedValue({
      roomId: "room_1",
      tableId: "table_x",
      metadata: { minBuyInCents: 2000, maxBuyInCents: 20000 },
    });
    mocks.loadLivePokerRoomIds.mockResolvedValue(new Set(["room_1"]));
    mocks.prismaFindUnique.mockResolvedValue(null);

    const result = await resumeCashTableForUser({ tableId: "table_x", userId: "u1" });
    expect(result.resumeStatus).toBe("NOT_SEATED");
    expect(result.playerStatus).toBe("NOT_SEATED");
  });

  it("returns FAILED for tournament tables", async () => {
    mocks.findLiveCashRoomByTableId.mockResolvedValue({
      roomId: "room_t",
      tableId: "table_t",
      metadata: { tournamentId: "t1", minBuyInCents: 10000, maxBuyInCents: 10000 },
    });
    mocks.loadLivePokerRoomIds.mockResolvedValue(new Set(["room_t"]));

    const result = await resumeCashTableForUser({ tableId: "table_t", userId: "u1" });
    expect(result.resumeStatus).toBe("FAILED");
    expect(result.recoveryReason).toBe("TOURNAMENT_TABLE_USE_ENSURE_TABLE");
  });
});
