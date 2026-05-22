import { describe, expect, it } from "vitest";
import { mapCashTableResumeMessage, resolveCashTableResumeOutcome } from "./cashTableRecovery";
import type { CashTableResumeResult } from "@/services/post/tables.resume";

function baseResult(overrides: Partial<CashTableResumeResult>): CashTableResumeResult {
  return {
    tableId: "table_cash",
    roomId: "room_live",
    tableLive: true,
    resumeStatus: "READY",
    playerStatus: "SEATED",
    ...overrides,
  };
}

describe("resolveCashTableResumeOutcome", () => {
  it("returns reconnect for READY", () => {
    const outcome = resolveCashTableResumeOutcome(baseResult({ resumeStatus: "READY" }));
    expect(outcome).toEqual({ kind: "reconnect", roomId: "room_live" });
  });

  it("returns reconnect for ROOM_RECOVERED", () => {
    const outcome = resolveCashTableResumeOutcome(
      baseResult({ resumeStatus: "ROOM_RECOVERED", roomId: "room_new" }),
    );
    expect(outcome).toEqual({ kind: "reconnect", roomId: "room_new" });
  });

  it("returns reconnect with buy-in for NEEDS_BUY_IN when room and min buy-in exist", () => {
    const outcome = resolveCashTableResumeOutcome(
      baseResult({ resumeStatus: "NEEDS_BUY_IN", minBuyInCents: 5000, playerStatus: "SEATED" }),
    );
    expect(outcome).toEqual({ kind: "reconnect", roomId: "room_live", buyInCents: 5000 });
  });

  it("returns blocked for NOT_SEATED", () => {
    const outcome = resolveCashTableResumeOutcome(
      baseResult({ resumeStatus: "NOT_SEATED", playerStatus: "NOT_SEATED" }),
    );
    expect(outcome.kind).toBe("blocked");
    if (outcome.kind === "blocked") {
      expect(outcome.message).toBe("Your seat is no longer reserved. Rejoin from the lobby.");
    }
  });

  it("returns blocked for ENDED", () => {
    const outcome = resolveCashTableResumeOutcome(
      baseResult({ resumeStatus: "ENDED", roomId: null, tableLive: false }),
    );
    expect(outcome.kind).toBe("blocked");
    if (outcome.kind === "blocked") {
      expect(outcome.message).toBe("This cash table is no longer available.");
    }
  });

  it("returns blocked for FAILED with mapped reason", () => {
    const outcome = resolveCashTableResumeOutcome(
      baseResult({
        resumeStatus: "FAILED",
        recoveryReason: "TOURNAMENT_TABLE_USE_ENSURE_TABLE",
      }),
    );
    expect(outcome.kind).toBe("blocked");
    if (outcome.kind === "blocked") {
      expect(outcome.message).toBe("Use tournament join for this table.");
    }
  });
});

describe("mapCashTableResumeMessage", () => {
  it("uses lobby rejoin copy for NOT_SEATED", () => {
    expect(mapCashTableResumeMessage(baseResult({ resumeStatus: "NOT_SEATED" }))).toBe(
      "Your seat is no longer reserved. Rejoin from the lobby.",
    );
  });
});
