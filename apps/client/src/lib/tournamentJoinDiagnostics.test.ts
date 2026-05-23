import { describe, expect, it } from "vitest";
import { isNotFoundJoinMessage } from "@/lib/tournamentJoinDiagnostics";

describe("isNotFoundJoinMessage", () => {
  it("detects tournament and colyseus not-found variants", () => {
    expect(isNotFoundJoinMessage("Tournament not found")).toBe(true);
    expect(isNotFoundJoinMessage('room "abc" not found')).toBe(true);
    expect(isNotFoundJoinMessage("Table no longer exists")).toBe(true);
    expect(isNotFoundJoinMessage("Registration closed")).toBe(false);
  });
});
