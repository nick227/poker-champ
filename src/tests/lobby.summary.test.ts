
import { describe, it, expect } from "vitest";
import type { LobbyTableSummary } from "../lobby/types.js";

describe("lobby table shape", () => {
  it("matches expected fields", () => {
    const t: LobbyTableSummary = {
      tableId:"t1",
      roomId:"r1",
      name:"1/2 NL",
      players:4,
      maxSeats:9,
      smallBlindCents:100,
      bigBlindCents:200,
      visibility:"PUBLIC",
      createdAt:Date.now()
    };
    expect(t.bigBlindCents).toBe(200);
  });
});
