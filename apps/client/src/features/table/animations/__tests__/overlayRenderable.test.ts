import { describe, expect, it } from "vitest";
import type { AnimationSettings, TableAnimationDefinition } from "../animationTypes";
import { resolveRenderableLayers } from "../overlayRenderable";

describe("overlayRenderable", () => {
  it("filters reduced motion skip types", () => {
    const def: TableAnimationDefinition = {
      id: "X",
      event: "POT_WIN",
      tier: 1,
      channel: "TABLE",
      anchor: "TABLE_CENTER",
      durationMs: 1000,
      layers: [
        { type: "FLASH" },
        { type: "PARTICLES", particleCount: 10 },
        { type: "STREAK", streakCount: 4 },
        { type: "BURST", rays: 12 },
        { type: "TEXT", textRole: "headline" },
      ],
    };
    const settings: AnimationSettings = { enabled: true, reducedMotion: true };
    const out = resolveRenderableLayers(def, settings);
    expect(out.map((l) => l.type)).toEqual(["FLASH", "TEXT"]);
  });

  it("resolves layer presets (preset merged, layer wins)", () => {
    const def: TableAnimationDefinition = {
      id: "X",
      event: "POT_WIN",
      tier: 4,
      channel: "TABLE",
      anchor: "TABLE_CENTER",
      durationMs: 1000,
      layers: [
        { type: "BURST", preset: "winBurst", durationMs: 1234 },
      ],
    };
    const settings: AnimationSettings = { enabled: true, reducedMotion: false };
    const [layer] = resolveRenderableLayers(def, settings);
    expect(layer.type).toBe("BURST");
    // preset provides rays; layer overrides durationMs
    if (layer.type === "BURST") expect(layer.rays).toBeDefined();
    expect(layer.durationMs).toBe(1234);
  });
});

