import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../lib/logger.js";
import { TableSeatSessionService } from "./TableSeatSessionService.js";

const { prismaRef } = vi.hoisted(() => ({
  prismaRef: { current: {} as any },
}));

vi.mock("@poker-champ/db", () => ({
  getPrisma: () => prismaRef.current,
}));

describe("TableSeatSessionService persistence fail-soft guards", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    prismaRef.current = {};
  });

  it("markLeft fails soft when tableSeatSession.updateMany is unavailable", async () => {
    prismaRef.current = {};
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger as any);

    await expect(
      TableSeatSessionService.markLeft({
        tableId: "table_test",
        userId: "user_test",
        reason: "CONSENTED_LEAVE",
      }),
    ).resolves.toBe(false);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: "table_test",
        userId: "user_test",
        op: "markLeft",
      }),
      "TABLE_SEAT_SESSION_PERSIST_SKIPPED",
    );
  });

  it("markLeft fails soft when updateMany throws", async () => {
    prismaRef.current = {
      tableSeatSession: {
        updateMany: vi.fn().mockRejectedValue(new Error("db disconnected")),
      },
    };
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger as any);

    await expect(
      TableSeatSessionService.markLeft({
        tableId: "table_test",
        userId: "user_test",
        reason: "SHUTDOWN",
      }),
    ).resolves.toBe(false);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: "table_test",
        userId: "user_test",
        op: "markLeft",
        message: "db disconnected",
      }),
      "TABLE_SEAT_SESSION_PERSIST_FAILED",
    );
  });

  it("markLeft distinguishes a 0-row match from a real update in its logging, while still reporting success", async () => {
    // updateMany completing without throwing but matching nothing (row already gone, or never
    // existed) is not itself a persistence failure -- but it must be logged distinctly from a
    // real applied update, so a reconciliation-required escalation upstream can tell which
    // underlying cause it's looking at instead of both looking like plain success.
    prismaRef.current = {
      tableSeatSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => logger as any);
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger as any);

    await expect(
      TableSeatSessionService.markLeft({
        tableId: "table_test",
        userId: "user_test",
        reason: "ALREADY_LEFT",
      }),
    ).resolves.toBe(true);

    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tableId: "table_test", userId: "user_test", op: "markLeft" }),
      "TABLE_SEAT_SESSION_UPDATE_NO_ROW_MATCHED",
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("markLeft reports success when updateMany succeeds", async () => {
    prismaRef.current = {
      tableSeatSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await expect(
      TableSeatSessionService.markLeft({
        tableId: "table_test",
        userId: "user_test",
        reason: "CASHED_OUT",
      }),
    ).resolves.toBe(true);
  });

  it("markSittingOut fails soft when tableSeatSession.updateMany is unavailable", async () => {
    prismaRef.current = {};
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger as any);

    await expect(
      TableSeatSessionService.markSittingOut({
        tableId: "table_test",
        userId: "user_test",
      }),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: "table_test",
        userId: "user_test",
        op: "markSittingOut",
      }),
      "TABLE_SEAT_SESSION_PERSIST_SKIPPED",
    );
  });

  it("touchConnected fails soft when updateMany throws", async () => {
    prismaRef.current = {
      tableSeatSession: {
        updateMany: vi.fn().mockRejectedValue(new Error("db disconnected")),
      },
    };
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger as any);

    await expect(
      TableSeatSessionService.touchConnected({
        tableId: "table_test",
        userId: "user_test",
      }),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: "table_test",
        userId: "user_test",
        op: "touchConnected",
        message: "db disconnected",
      }),
      "TABLE_SEAT_SESSION_PERSIST_FAILED",
    );
  });
});
