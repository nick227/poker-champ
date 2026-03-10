import { describe, expect, it } from "vitest";
import { projectDecisionState } from "../stateProjection.js";

describe("stateProjection", () => {
  it("projects runtime shape into DecisionState", () => {
    const players = [
      {
        id: "p1",
        seat: 1,
        kind: "HUMAN" as const,
        status: "ACTIVE" as const,
        connected: true,
        needsAction: true,
      },
    ];
    const projected = projectDecisionState({
      tableId: "table_1",
      handId: "hand_1",
      street: "FLOP",
      toActSeat: 1,
      turnDeadlineMs: 12345,
      players,
    });

    expect(projected.tableId).toBe("table_1");
    expect(projected.hand?.handId).toBe("hand_1");
    expect(projected.hand?.street).toBe("FLOP");
    expect(projected.hand?.toActSeat).toBe(1);
    expect(projected.hand?.turnDeadlineMs).toBe(12345);
    expect(projected.players).toHaveLength(1);
    expect(projected.players[0]?.id).toBe("p1");
    expect(projected.players).toBe(players);
  });

  it("omits hand when runtime handId is missing", () => {
    const projected = projectDecisionState({
      tableId: "table_2",
      players: [],
    });
    expect(projected.hand).toBeUndefined();
  });

  it("preserves hand reference when runtime hand object is provided", () => {
    const hand = {
      handId: "hand_ref",
      street: "TURN" as const,
      toActSeat: 3,
      turnDeadlineMs: 555,
    };
    const projected = projectDecisionState({
      tableId: "table_3",
      hand,
      players: [],
    });
    expect(projected.hand).toBe(hand);
  });
});
