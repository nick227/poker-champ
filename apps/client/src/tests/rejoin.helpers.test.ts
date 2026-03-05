import { describe, expect, it } from "vitest";
import { isRejoinErrorMessage, mapRejoinErrorMessage, resolveTableGoneForRejoin } from "@/features/table-page/rejoin.helpers";

describe("rejoin helpers", () => {
  it("classifies only rejoin-related errors", () => {
    expect(isRejoinErrorMessage("REJOIN_FAILED_OUT_OF_CHIPS")).toBe(true);
    expect(isRejoinErrorMessage("Could not rejoin table. Please retry.")).toBe(true);
    expect(isRejoinErrorMessage("Connection lost")).toBe(true);
    expect(isRejoinErrorMessage("Table no longer exists")).toBe(true);

    expect(isRejoinErrorMessage("Insufficient bankroll for this table")).toBe(false);
    expect(isRejoinErrorMessage("Session replaced by a newer connection")).toBe(false);
    expect(isRejoinErrorMessage("")).toBe(false);
    expect(isRejoinErrorMessage(undefined)).toBe(false);
  });

  it("maps rejoin errors to stable UX copy", () => {
    expect(mapRejoinErrorMessage("REJOIN_FAILED_OUT_OF_CHIPS")).toBe("Could not rejoin table. You are out of chips.");
    expect(mapRejoinErrorMessage("REJOIN_FAILED_NOT_SEATED")).toBe("Could not rejoin table. You are not seated.");
    expect(mapRejoinErrorMessage("REJOIN_FAILED_TABLE_GONE")).toBe("Table no longer exists");
    expect(mapRejoinErrorMessage("REJOIN_FAILED_TEMPORARY")).toBe("Could not rejoin table. Please retry.");
    expect(mapRejoinErrorMessage("")).toBe("Could not rejoin table. Please retry.");
  });

  it("resolves TABLE_GONE as in-place error during rejoin send", () => {
    const resolution = resolveTableGoneForRejoin("sending");
    expect(resolution.shouldCloseTable).toBe(false);
    expect(resolution.nextRejoinUiState).toBe("error");
    expect(resolution.rejoinErrorMessage).toBe("Table no longer exists");
  });

  it("resolves TABLE_GONE as normal close outside rejoin send", () => {
    expect(resolveTableGoneForRejoin("idle")).toEqual({ shouldCloseTable: true });
    expect(resolveTableGoneForRejoin("error")).toEqual({ shouldCloseTable: true });
  });
});
