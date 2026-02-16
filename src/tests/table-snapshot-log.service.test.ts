import { afterEach, describe, expect, it, vi } from "vitest";
import * as prismaDb from "../db/prisma.js";
import * as loggerModule from "../lib/logger.js";
import { TableSnapshotLogService } from "../engine/persistence/TableSnapshotLogService.js";

describe("TableSnapshotLogService", () => {
  const sampleRateEnv = process.env.SNAPSHOT_LOG_SAMPLE_RATE;
  const payloadCapEnv = process.env.SNAPSHOT_LOG_MAX_BYTES;

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.SNAPSHOT_LOG_SAMPLE_RATE = sampleRateEnv;
    process.env.SNAPSHOT_LOG_MAX_BYTES = payloadCapEnv;
  });

  it("skips insert when sample rate filter drops payload", async () => {
    process.env.SNAPSHOT_LOG_SAMPLE_RATE = "0";
    const create = vi.fn();
    vi.spyOn(prismaDb, "getPrisma").mockReturnValue({ tableSnapshotLog: { create } } as any);

    await TableSnapshotLogService.writeSnapshot({
      tableId: "t1",
      handId: "h1",
      snapshotId: "s1",
      reason: "HAND_START",
      street: "PREFLOP",
      payloadJson: { ok: true },
      stateHash: "hash",
      schemaVersion: 1,
    });

    expect(create).not.toHaveBeenCalled();
  });

  it("skips insert and warns when payload exceeds byte cap", async () => {
    process.env.SNAPSHOT_LOG_SAMPLE_RATE = "1";
    process.env.SNAPSHOT_LOG_MAX_BYTES = "10";
    const create = vi.fn();
    const warn = vi.spyOn(loggerModule.logger, "warn").mockImplementation(() => loggerModule.logger);
    vi.spyOn(prismaDb, "getPrisma").mockReturnValue({ tableSnapshotLog: { create } } as any);

    await TableSnapshotLogService.writeSnapshot({
      tableId: "t2",
      handId: "h2",
      snapshotId: "s2",
      reason: "HAND_END",
      street: "RIVER",
      payloadJson: { veryLarge: "this is definitely larger than ten bytes" },
      stateHash: "hash2",
      schemaVersion: 1,
    });

    expect(create).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("ignores duplicate snapshotId errors", async () => {
    process.env.SNAPSHOT_LOG_SAMPLE_RATE = "1";
    const create = vi.fn().mockRejectedValue({ code: "P2002" });
    vi.spyOn(prismaDb, "getPrisma").mockReturnValue({ tableSnapshotLog: { create } } as any);

    await expect(
      TableSnapshotLogService.writeSnapshot({
        tableId: "t3",
        handId: "h3",
        snapshotId: "dup_1",
        reason: "ACTION_ACCEPTED",
        street: "TURN",
        payloadJson: { a: 1 },
        stateHash: "hash3",
        schemaVersion: 1,
      }),
    ).resolves.toBeUndefined();
  });

  it("falls back to null handId when hand foreign key is not yet persisted", async () => {
    process.env.SNAPSHOT_LOG_SAMPLE_RATE = "1";
    const create = vi
      .fn()
      .mockRejectedValueOnce({
        code: "P2003",
        meta: { field_name: "TableSnapshotLog_handId_fkey (index)" },
      })
      .mockResolvedValueOnce({});
    const warn = vi.spyOn(loggerModule.logger, "warn").mockImplementation(() => loggerModule.logger);
    vi.spyOn(prismaDb, "getPrisma").mockReturnValue({ tableSnapshotLog: { create } } as any);

    await expect(
      TableSnapshotLogService.writeSnapshot({
        tableId: "t4",
        handId: "h4",
        snapshotId: "fk_1",
        reason: "HAND_START",
        street: "PREFLOP",
        payloadJson: { a: 1 },
        stateHash: "hash4",
        schemaVersion: 1,
      }),
    ).resolves.toBeUndefined();

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]?.[0]?.data?.handId).toBe("h4");
    expect(create.mock.calls[1]?.[0]?.data?.handId).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});
