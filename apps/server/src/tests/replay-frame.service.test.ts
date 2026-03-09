import { afterEach, describe, expect, it, vi } from "vitest";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import * as prismaDb from "../db/prisma.js";
import { ReplayFrameService } from "../engine/persistence/ReplayFrameService.js";

function makeSnapshot(
  snapshotSeq: number,
  reason: TableSnapshotPayload["reason"],
  options?: { heroUserId?: string; snapshotId?: string },
): TableSnapshotPayload {
  return {
    version: 1,
    snapshotId: options?.snapshotId ?? `snap_${snapshotSeq}_${reason}`,
    snapshotSeq,
    emittedAtTs: 1_700_000_000_000 + snapshotSeq,
    serverTimeTs: 1_700_000_000_000 + snapshotSeq,
    stateHash: `hash_${snapshotSeq}_${reason}`,
    reason,
    table: {
      tableId: "t_replay",
      tableName: "Replay Test",
      visibility: "PUBLIC",
      maxSeats: 2,
      smallBlindCents: 50,
      bigBlindCents: 100,
      minBuyInCents: 1000,
      maxBuyInCents: 10000,
    },
    hand: {
      handId: "h_replay",
      handNumber: 1,
      street: "PREFLOP",
      dealerSeat: 0,
      sbSeat: 0,
      bbSeat: 1,
      toActSeat: 0,
      actionCount: snapshotSeq,
      roundCurrentBetCents: 100,
      minRaiseCents: 100,
      potCents: 150,
      board: [],
    },
    seats: [
      {
        seat: 0,
        occupied: true,
        userId: "u1",
        isBot: false,
        name: "u1",
        status: "ACTIVE",
        stackCents: 1000,
        roundBetCents: 50,
        committedCents: 50,
        connected: true,
        isDealer: true,
        isToAct: true,
      },
      {
        seat: 1,
        occupied: true,
        userId: "u2",
        isBot: false,
        name: "u2",
        status: "ACTIVE",
        stackCents: 1000,
        roundBetCents: 100,
        committedCents: 100,
        connected: true,
        isDealer: false,
        isToAct: false,
      },
    ],
    hero: {
      userId: options?.heroUserId ?? "SYSTEM",
      youAreSeated: false,
    },
  };
}

describe("ReplayFrameService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns replay frames ordered by snapshotSeq, deduped, and replay-reason filtered", async () => {
    const rows = [
      { payloadJson: makeSnapshot(3, "ACTION_ACCEPTED", { snapshotId: "s3_first" }) },
      { payloadJson: makeSnapshot(1, "JOIN", { snapshotId: "s1_join_ignored" }) }, // non-frame reason
      { payloadJson: makeSnapshot(2, "HAND_START", { snapshotId: "s2_start" }) },
      { payloadJson: { not: "a-valid-snapshot" } }, // invalid payload
      { payloadJson: makeSnapshot(3, "HAND_END", { snapshotId: "s3_duplicate_ignored" }) }, // duplicate seq
      { payloadJson: makeSnapshot(4, "BOT_ACTION", { snapshotId: "s4_bot_action_maps_to_frame" }) },
    ];

    const findMany = vi.fn().mockResolvedValue(rows);
    vi.spyOn(prismaDb, "getPrisma").mockReturnValue({ tableSnapshotLog: { findMany } } as any);

    const frames = await ReplayFrameService.getFramesForHand("h_replay");

    expect(frames.map((f) => f.snapshotSeq)).toEqual([2, 3, 4]);
    expect(frames.map((f) => f.reason)).toEqual(["HAND_START", "ACTION_ACCEPTED", "BOT_ACTION"]);
    expect(frames[1]?.snapshotId).toBe("s3_first");
  });

  it("queries only SYSTEM perspective rows for the requested hand", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    vi.spyOn(prismaDb, "getPrisma").mockReturnValue({ tableSnapshotLog: { findMany } } as any);

    await ReplayFrameService.getFramesForHand("hand_123");

    expect(findMany).toHaveBeenCalledWith({
      where: {
        handId: "hand_123",
        payloadJson: {
          path: "$.hero.userId",
          equals: "SYSTEM",
        },
      },
      select: {
        payloadJson: true,
      },
      orderBy: [{ createdAt: "asc" }],
    });
  });
});
