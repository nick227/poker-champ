import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetHapticEventStateForTests, emitHapticEvent } from "@/haptics/emitHapticEvent";

const triggerHaptic = vi.fn();

vi.mock("@/lib/haptics", () => ({
  triggerHaptic: (pattern: unknown) => triggerHaptic(pattern),
}));

describe("haptic event router", () => {
  beforeEach(() => {
    __resetHapticEventStateForTests();
    triggerHaptic.mockClear();
    vi.restoreAllMocks();
  });

  it("maps semantic events to haptic patterns", () => {
    emitHapticEvent("table.action.bet");
    expect(triggerHaptic).toHaveBeenCalledWith({ kind: "impact", style: "Medium" });
    expect(triggerHaptic).toHaveBeenCalledTimes(1);
  });

  it("maps routine actions to a light impact", () => {
    emitHapticEvent("table.action.check");
    expect(triggerHaptic).toHaveBeenCalledWith({ kind: "impact", style: "Light" });
  });

  it("maps fold to a warning notification, not a buzz", () => {
    emitHapticEvent("table.action.fold");
    expect(triggerHaptic).toHaveBeenCalledWith({ kind: "notification", type: "Warning" });
  });

  it("maps all-in to a heavy impact", () => {
    emitHapticEvent("table.action.allIn");
    expect(triggerHaptic).toHaveBeenCalledWith({ kind: "impact", style: "Heavy" });
  });

  it("maps a pot win to a success notification", () => {
    emitHapticEvent("table.potWin");
    expect(triggerHaptic).toHaveBeenCalledWith({ kind: "notification", type: "Success" });
  });

  it("maps card deal to a selection tick", () => {
    emitHapticEvent("table.cardDeal");
    expect(triggerHaptic).toHaveBeenCalledWith({ kind: "selection" });
  });

  it("enforces cooldown per event", () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValueOnce(1000);
    emitHapticEvent("table.cardDeal");
    now.mockReturnValueOnce(1010);
    emitHapticEvent("table.cardDeal");
    now.mockReturnValueOnce(1045);
    emitHapticEvent("table.cardDeal");

    expect(triggerHaptic).toHaveBeenCalledTimes(2);
  });

  it("tracks cooldowns independently per event", () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValueOnce(1000);
    emitHapticEvent("table.action.check");
    now.mockReturnValueOnce(1010);
    emitHapticEvent("table.action.call");

    expect(triggerHaptic).toHaveBeenCalledTimes(2);
  });

  it("throws when an unmapped event is emitted", () => {
    expect(() =>
      emitHapticEvent("haptics.missing" as unknown as Parameters<typeof emitHapticEvent>[0]),
    ).toThrow("[haptics] Unmapped HapticEvent");
  });
});
