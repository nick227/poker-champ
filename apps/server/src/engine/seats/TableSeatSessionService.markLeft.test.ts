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
    ).resolves.toBeUndefined();

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
    ).resolves.toBeUndefined();

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
