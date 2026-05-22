import { describe, expect, it } from "vitest";
import {
  formatCashLobbyJoinHint,
  hasCashLobbyActiveHumans,
  resolveCashLobbyJoin,
} from "@/lib/lobbyTables";

describe("cash lobby join", () => {
  it("treats missing connectedHumanCount as no active players", () => {
    expect(hasCashLobbyActiveHumans({})).toBe(false);
    expect(resolveCashLobbyJoin({ minBuyInCents: 2000 }, 10_000)).toEqual({
      canJoin: false,
      joinBlockReason: "no_active_players",
    });
    expect(formatCashLobbyJoinHint("no_active_players")).toBe("Waiting for players");
  });

  it("blocks join when connectedHumanCount is zero even with sufficient bankroll", () => {
    expect(
      resolveCashLobbyJoin({ connectedHumanCount: 0, minBuyInCents: 2000 }, 50_000),
    ).toEqual({
      canJoin: false,
      joinBlockReason: "no_active_players",
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

  it("blocks join for insufficient balance when humans are present", () => {
    expect(
      resolveCashLobbyJoin({ connectedHumanCount: 2, minBuyInCents: 5000 }, 1000),
    ).toEqual({
      canJoin: false,
      joinBlockReason: "insufficient_balance",
    });
  });
});
