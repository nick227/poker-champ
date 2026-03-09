import { describe, expect, it, vi } from "vitest";
import { PresenceIndex } from "../lobby/PresenceIndex.js";

describe("PresenceIndex", () => {
  it("adds and removes users with deduped count", () => {
    const index = new PresenceIndex();
    index.add("u1", { kind: "LOBBY" }, "Alice");
    index.add("u1", { kind: "LOBBY" }, "Alice");
    index.add("u2", { kind: "LOBBY" }, "Bob");
    expect(index.getTotalOnline()).toBe(2);

    index.remove("u1", { kind: "LOBBY" });
    expect(index.getTotalOnline()).toBe(2);
    index.remove("u1", { kind: "LOBBY" });
    expect(index.getTotalOnline()).toBe(1);
  });

  it("maps multiple table memberships to MULTI_TABLE", () => {
    const index = new PresenceIndex();
    index.add("u1", { kind: "TABLE", tableId: "t1", tableName: "Alpha" }, "Alice");
    index.add("u1", { kind: "TABLE", tableId: "t1", tableName: "Alpha" }, "Alice");
    index.add("u1", { kind: "TABLE", tableId: "t2", tableName: "Bravo" }, "Alice");

    const players = index.getPlayersSnapshot();
    expect(players).toHaveLength(1);
    expect(players[0]?.location.kind).toBe("MULTI_TABLE");
    if (players[0]?.location.kind === "MULTI_TABLE") {
      expect(players[0].location.tables.map((t) => t.tableId)).toEqual(["t1", "t2"]);
    }

    index.remove("u1", { kind: "TABLE", tableId: "t1", tableName: "Alpha" });
    expect(index.getPlayersSnapshot()[0]?.location.kind).toBe("MULTI_TABLE");
  });

  it("keeps totalOnline at 1 when same user is in lobby and a table", () => {
    const index = new PresenceIndex();
    index.add("u1", { kind: "LOBBY" }, "Alice");
    index.add("u1", { kind: "TABLE", tableId: "t1", tableName: "Alpha" }, "Alice");

    expect(index.getTotalOnline()).toBe(1);
    const players = index.getPlayersSnapshot();
    expect(players).toHaveLength(1);
    expect(players[0]?.location.kind).toBe("TABLE");

    index.remove("u1", { kind: "LOBBY" });
    expect(index.getTotalOnline()).toBe(1);
    expect(index.getPlayersSnapshot()[0]?.location.kind).toBe("TABLE");

    index.remove("u1", { kind: "TABLE", tableId: "t1", tableName: "Alpha" });
    expect(index.getTotalOnline()).toBe(0);
  });

  it("rejects new adds when at maxEntries cap", () => {
    const index = new PresenceIndex({ maxEntries: 2 });
    index.add("u1", { kind: "LOBBY" }, "Alice");
    index.add("u2", { kind: "LOBBY" }, "Bob");
    expect(index.getTotalOnline()).toBe(2);

    const added = index.add("u3", { kind: "LOBBY" }, "Charlie");
    expect(added).toBe(false);
    expect(index.getTotalOnline()).toBe(2);
  });

  it("allows add for existing user when at cap", () => {
    const index = new PresenceIndex({ maxEntries: 2 });
    index.add("u1", { kind: "LOBBY" }, "Alice");
    index.add("u2", { kind: "LOBBY" }, "Bob");

    const added = index.add("u1", { kind: "TABLE", tableId: "t1", tableName: "Alpha" }, "Alice");
    expect(added).toBe(true);
    expect(index.getTotalOnline()).toBe(2);
  });

  it("allows add when maxEntries is not set", () => {
    const index = new PresenceIndex();
    expect(index.add("u1", { kind: "LOBBY" }, "Alice")).toBe(true);
    expect(index.add("u2", { kind: "LOBBY" }, "Bob")).toBe(true);
  });

  it("publishes online totals to subscribers", () => {
    const index = new PresenceIndex();
    const listener = vi.fn();
    const unsubscribe = index.subscribe(listener);

    index.add("u1", { kind: "LOBBY" }, "Alice");
    index.add("u2", { kind: "TABLE", tableId: "t1", tableName: "Table 1" }, "Bob");
    index.remove("u1", { kind: "LOBBY" });

    expect(listener).toHaveBeenCalledWith(1);
    expect(listener).toHaveBeenCalledWith(2);
    expect(listener).toHaveBeenCalledWith(1);

    unsubscribe();
  });
});
