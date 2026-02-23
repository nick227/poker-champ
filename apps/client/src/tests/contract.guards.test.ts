import { describe, expect, it } from "vitest";
import { isValidLobbyInbound, isValidLobbyOutbound, isValidTableInbound, isValidTableOutbound } from "@/realtime/contract.guards";

describe("realtime contract guards", () => {
  it("accepts valid lobby/table envelopes", () => {
    expect(isValidLobbyInbound("LIST_TABLES")).toBe(true);
    expect(isValidLobbyInbound("LIST_ONLINE_PLAYERS")).toBe(true);
    expect(isValidLobbyOutbound("TABLE_LIST", { tables: [] })).toBe(true);
    expect(isValidLobbyOutbound("ONLINE_COUNT", { totalOnline: 3 })).toBe(true);
    expect(isValidLobbyOutbound("ONLINE_PLAYERS", { totalOnline: 1, generatedAt: Date.now(), players: [] })).toBe(true);
    expect(isValidTableInbound("ACTION", { action: "RAISE", amountCents: 100, actionId: "a1" })).toBe(true);
    expect(isValidTableInbound("LIST_BOTS", {})).toBe(true);
    expect(isValidTableOutbound("WELCOME", { roomId: "r1", playerId: "u1", tableId: "t1", joinMode: "NEW" })).toBe(true);
    expect(isValidTableOutbound("BOTS_LIST", { bots: [{ id: "nash_nate", name: "Nash Nate" }] })).toBe(true);
  });

  it("rejects invalid lobby/table envelopes", () => {
    expect(isValidLobbyInbound("CREATE_TABLE")).toBe(false);
    expect(isValidLobbyOutbound("TABLE_LIST", { wrong: true })).toBe(false);
    expect(isValidTableInbound("ACTION", { action: "raise" })).toBe(false);
    expect(isValidTableOutbound("WELCOME", { roomId: "r1" })).toBe(false);
  });
});
