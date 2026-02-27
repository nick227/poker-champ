import { describe, expect, it } from "vitest";
import { normalizeTable } from "@/lib/lobbyTables";

describe("normalizeTable", () => {
  it("uses stable tableId for row id while preserving roomId", () => {
    const now = Date.now();
    const row = normalizeTable({
      tableId: "table_abc",
      roomId: "room_xyz",
      name: "Test",
      players: 2,
      maxSeats: 6,
      minBuyInCents: 2000,
      maxBuyInCents: 20000,
      creatorName: "Nico",
      creatorAvatarUrl: "/uploads/avatars/nico.png",
      updatedAt: now,
      avgPotCents: 4550,
      waitlistCount: 2,
    });

    expect(row.id).toBe("table_abc");
    expect(row.tableId).toBe("table_abc");
    expect(row.roomId).toBe("room_xyz");
    expect(row.creatorName).toBe("Nico");
    expect(row.creatorAvatarUrl).toBe("/uploads/avatars/nico.png");
    expect(row.updatedAt).toBe(new Date(now).toISOString());
    expect(row.avgPotCents).toBe(4550);
    expect(row.waitlistCount).toBe(2);
  });
});
