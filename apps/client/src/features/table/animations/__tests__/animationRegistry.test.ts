import { describe, expect, it } from "vitest";
import { getPreloadSources, resolveAnimation, resolveAnimationWithCompanions, TABLE_ANIMATIONS } from "../animationRegistry";

describe("animationRegistry", () => {
  it("exports an event→tier registry and resolves tier with fallback to lower tiers", () => {
    expect(TABLE_ANIMATIONS.POT_WIN.length).toBeGreaterThan(0);
    const exact = resolveAnimation("POT_WIN", 4);
    expect(exact?.event).toBe("POT_WIN");
    expect(exact?.tier).toBe(4);

    const fallback = resolveAnimation("POT_WIN", 999);
    expect(fallback?.event).toBe("POT_WIN");
    expect(fallback?.tier).toBe(4);

    const floor = resolveAnimation("POT_WIN", 0);
    expect(floor?.tier).toBe(0);
  });

  it("freezes definitions and layers to prevent mutation", () => {
    const def = resolveAnimation("POT_WIN", 2);
    expect(def).toBeDefined();
    if (!def) return;
    expect(Object.isFrozen(def)).toBe(true);
    expect(Object.isFrozen(def.layers)).toBe(true);
    expect(def.layers.length).toBeGreaterThan(0);
    expect(Object.isFrozen(def.layers[0])).toBe(true);
  });

  it("exposes preload sources (deduped)", () => {
    const sources = getPreloadSources();
    const keys = sources.map((s) => `${s.source}:${s.variant ?? ""}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("resolveAnimationWithCompanions returns table definition and optional hero/seat companions", () => {
    const out = resolveAnimationWithCompanions({ event: "POT_WIN", tier: 2, payload: { winnerSeat: 1 } });
    expect(out.table?.event).toBe("POT_WIN");
    // hero/seat may be undefined depending on request; ensure keys exist
    expect(Object.prototype.hasOwnProperty.call(out, "hero")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(out, "seat")).toBe(true);
  });
});

