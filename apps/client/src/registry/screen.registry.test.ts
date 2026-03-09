import { describe, expect, it } from "vitest";
import { bottomBarScreens, getDefaultRoute, screenRegistry } from "@/registry/screen.registry";

describe("screen registry", () => {
  it("returns auth-aware default routes", () => {
    expect(getDefaultRoute(true)).toBe(screenRegistry.byKey.lobby.path);
    expect(getDefaultRoute(false)).toBe(screenRegistry.byKey.lobby.path);
  });

  it("exposes bottom bar screens from registry metadata", () => {
    const keys = bottomBarScreens.map((s) => s.key);
    expect(keys).toContain("lobby");
    expect(keys).toContain("lessons");
    expect(keys).toContain("settings");
    expect(keys).not.toContain("history");
    expect(keys).not.toContain("slots");
  });
});
