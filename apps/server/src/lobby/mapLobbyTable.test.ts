import { describe, expect, it } from "vitest";
import { resolveLobbyOccupancy, toLobbyTableSummary } from "./mapLobbyTable.js";

describe("resolveLobbyOccupancy", () => {
  it("prefers seatedCount over human or client fallbacks", () => {
    expect(resolveLobbyOccupancy({ seatedCount: 5, humanCount: 1 }, 9)).toBe(5);
    expect(resolveLobbyOccupancy({ humanCount: 2 }, 9)).toBe(2);
    expect(resolveLobbyOccupancy({}, 3)).toBe(3);
  });
});

describe("toLobbyTableSummary", () => {
  it("maps occupancy from seatedCount", () => {
    const row = toLobbyTableSummary({
      roomId: "r1",
      clients: 1,
      maxClients: 9,
      metadata: {
        tableId: "t1",
        name: "Emerald",
        seatedCount: 4,
        humanCount: 1,
        connectedHumanCount: 1,
        maxSeats: 9,
        smallBlindCents: 25,
        bigBlindCents: 50,
      },
    });
    expect(row.players).toBe(4);
    expect(row.seatedCount).toBe(4);
    expect(row.connectedHumanCount).toBe(1);
    expect(row).not.toHaveProperty("avgPotCents");
    expect(row).not.toHaveProperty("waitlistCount");
  });
});
