import { describe, expect, it } from "vitest";
import { mergeLobbyTableViewerState } from "./useLobbyRealtime";

describe("mergeLobbyTableViewerState", () => {
  it("does not let a generic realtime update erase authenticated viewer membership", () => {
    const [merged] = mergeLobbyTableViewerState(
      [{ tableId: "cash-1", viewer: { status: "RECONNECTABLE", canResume: true } }],
      [{ tableId: "cash-1", players: 2, viewer: { status: "NONE", canResume: false } }],
    ) as Array<Record<string, any>>;

    expect(merged?.players).toBe(2);
    expect(merged?.viewer).toEqual({ status: "RECONNECTABLE", canResume: true });
  });
});
