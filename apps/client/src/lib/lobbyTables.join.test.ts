import { describe, expect, it } from "vitest";
import {
  formatCashLobbyJoinHint,
  hasCashLobbyActiveHumans,
  resolveCashLobbyJoin,
} from "@/lib/lobbyTables";

describe("cash lobby join", () => {
  it("allows join to empty tables when bankroll is sufficient", () => {
    expect(hasCashLobbyActiveHumans({})).toBe(false);
    expect(resolveCashLobbyJoin({ minBuyInCents: 2000 }, 10_000)).toEqual({
      canJoin: true,
      joinBlockReason: null,
    });
  });

  it("allows join when connectedHumanCount is zero and bankroll is sufficient", () => {
    expect(
      resolveCashLobbyJoin({ connectedHumanCount: 0, minBuyInCents: 2000 }, 50_000),
    ).toEqual({
      canJoin: true,
      joinBlockReason: null,
    });
  });

  it("allows join when at least one human is connected and bankroll is sufficient", () => {
    expect(
      resolveCashLobbyJoin({ connectedHumanCount: 1, minBuyInCents: 2000 }, 50_000),
    ).toEqual({
      canJoin: true,
      joinBlockReason: null,
    });
  });

  it("blocks join for insufficient balance regardless of active players", () => {
    expect(
      resolveCashLobbyJoin({ connectedHumanCount: 2, minBuyInCents: 5000 }, 1000),
    ).toEqual({
      canJoin: false,
      joinBlockReason: "insufficient_balance",
    });
    expect(
      resolveCashLobbyJoin({ connectedHumanCount: 0, minBuyInCents: 5000 }, 1000),
    ).toEqual({
      canJoin: false,
      joinBlockReason: "insufficient_balance",
    });
  });
});
