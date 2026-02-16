import { describe, expect, it, vi } from "vitest";
import { executeTableAction, tableActionRegistry } from "@/registry/table-action.registry";

describe("table-action registry", () => {
  it("has stable ordered entries", () => {
    expect(tableActionRegistry.ordered.length).toBe(6);
    expect(tableActionRegistry.ordered[0].key).toBe("fold");
    expect(tableActionRegistry.ordered[tableActionRegistry.ordered.length - 1].key).toBe("allIn");
    expect(tableActionRegistry.byKey.bet.requiresAmount).toBe(true);
  });

  it("executes generic action payload", async () => {
    const send = vi.fn(async () => undefined);
    await executeTableAction("raise", { tableId: "table_1", amountCents: 250 }, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      type: "ACTION",
      action: "raise",
      tableId: "table_1",
      amountCents: 250,
    });
  });
});
