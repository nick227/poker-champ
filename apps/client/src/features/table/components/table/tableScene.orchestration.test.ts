import { describe, it, expect } from "vitest";
import {
  getTableTopBarFlags,
  resolveTableSceneMode,
  shouldKeepOverlaysMountedAcrossModeChange,
} from "./tableScene.orchestration";

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

  it("returns add-bot flag", () => {
    const flags = getTableTopBarFlags({
      canAddBot: true,
    });

    expect(flags.showAddBot).toBe(true);
  });

  it("hides add-bot when not allowed", () => {
    const flags = getTableTopBarFlags({
      canAddBot: false,
    });

    expect(flags.showAddBot).toBe(false);
  });
});

