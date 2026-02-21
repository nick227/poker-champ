import { describe, it, expect } from "vitest";
import {
  getTableTopBarFlags,
  resolveTableSceneMode,
  shouldKeepOverlaysMountedAcrossModeChange,
} from "@/components/domain/table/tableScene.orchestration";

describe("table scene orchestration", () => {
  it("resolves connecting -> idle -> active mode path", () => {
    expect(
      resolveTableSceneMode({
        authHydrated: true,
        hasAuthToken: true,
        hasSnapshot: false,
        hasActiveHand: false,
      }),
    ).toBe("connecting");

    expect(
      resolveTableSceneMode({
        authHydrated: true,
        hasAuthToken: true,
        hasSnapshot: true,
        hasActiveHand: false,
      }),
    ).toBe("idle");

    expect(
      resolveTableSceneMode({
        authHydrated: true,
        hasAuthToken: true,
        hasSnapshot: true,
        hasActiveHand: true,
      }),
    ).toBe("active");
  });

  it("keeps overlays mounted across idle/active switches", () => {
    expect(shouldKeepOverlaysMountedAcrossModeChange("idle", "active")).toBe(true);
    expect(shouldKeepOverlaysMountedAcrossModeChange("active", "idle")).toBe(true);
    expect(shouldKeepOverlaysMountedAcrossModeChange("connecting", "idle")).toBe(false);
  });

  it("returns unified table top-bar flags", () => {
    const flags = getTableTopBarFlags({
      canDeleteTable: true,
      canAddBot: true,
    });

    expect(flags.showDelete).toBe(true);
    expect(flags.showAddBot).toBe(true);
    expect(flags.showChat).toBe(true);
    expect(flags.showClose).toBe(true);
  });

  it("hides delete and add-bot when not allowed", () => {
    const flags = getTableTopBarFlags({
      canDeleteTable: false,
      canAddBot: false,
    });

    expect(flags.showDelete).toBe(false);
    expect(flags.showAddBot).toBe(false);
    expect(flags.showChat).toBe(true);
    expect(flags.showClose).toBe(true);
  });
});

