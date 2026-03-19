import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PokerState } from "../../state/PokerState.js";
import { Dealer } from "../Dealer.js";
import { CashierService } from "../economy/CashierService.js";

describe("Dealer v2 smoke", () => {
  beforeEach(() => {
    vi.spyOn(CashierService, "processCashGameBuyIn").mockResolvedValue({
      success: true,
      newTableBalance: 5000,
    });
    vi.spyOn(CashierService, "processCashGameCashOut").mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts a hand when 2 players join", async () => {
    const state = new PokerState();
    const dealer = new Dealer(state);
    dealer.stopDisconnectSweep();

    await dealer.addPlayer("p1", "A", 5000);
    await dealer.addPlayer("p2", "B", 5000);

    expect(state.street).toBe("PREFLOP");
    expect(state.handId).toMatch(/^hand_/);
    expect(state.potCents).toBeGreaterThan(0); // blinds posted
  });

  it("dispose stops timers/sweeps and prevents further queued work", async () => {
    const state = new PokerState();
    const dealer = new Dealer(state);
    const internal = dealer as any;
    const handOrchestratorDisposeSpy = vi.spyOn(internal.handOrchestrator, "dispose");
    const turnTimeoutClearSpy = vi.spyOn(internal.turnManager, "clearPendingHumanTurnTimeout");
    const disconnectDisposeSpy = vi.spyOn(internal.disconnectManager, "dispose");
    const queuedWork = vi.fn(async () => {});

    dealer.dispose();
    await internal.turnManager.enqueuePlayerAction(queuedWork);

    expect(handOrchestratorDisposeSpy).toHaveBeenCalledTimes(1);
    expect(turnTimeoutClearSpy).toHaveBeenCalledTimes(1);
    expect(disconnectDisposeSpy).toHaveBeenCalledTimes(1);
    expect(queuedWork).not.toHaveBeenCalled();
  });

  it("ignores stale internal actions while preserving strict external validation", async () => {
    const state = new PokerState();
    state.tableId = "table_stale_internal_action";
    state.handId = "hand_stale_internal_action";
    state.street = "TURN";

    const dealer = new Dealer(state);

    await expect((dealer as any)._handleAction("bot_missing", { action: "ALL_IN" }, "AUTO")).resolves.toBeUndefined();
    await expect((dealer as any)._handleAction("bot_missing", { action: "ALL_IN" }, "PLAYER")).rejects.toMatchObject({
      code: "BAD_STATE",
    });
  });
});
