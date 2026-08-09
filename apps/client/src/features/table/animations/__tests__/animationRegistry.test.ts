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

  describe("SHOWDOWN", () => {
    it("is wired into the registry with a full tier 0-4 ladder", () => {
      expect(TABLE_ANIMATIONS.SHOWDOWN.length).toBe(5);
      for (let tier = 0; tier <= 4; tier++) {
        const def = resolveAnimation("SHOWDOWN", tier);
        expect(def?.event).toBe("SHOWDOWN");
        expect(def?.tier).toBe(tier);
        expect(def?.layers.length).toBeGreaterThan(0);
      }
    });

    it("resolves the SEAT_GLOW_SHOWDOWN companion once payload.anchorSeat is present", () => {
      const withoutAnchor = resolveAnimationWithCompanions({ event: "SHOWDOWN", tier: 2 });
      expect(withoutAnchor.seat).toBeUndefined();

      const withAnchor = resolveAnimationWithCompanions({
        event: "SHOWDOWN",
        tier: 2,
        payload: { anchorSeat: 0 },
      });
      expect(withAnchor.seat?.id).toBe("SEAT_GLOW_SHOWDOWN");
    });
  });

  describe("ALL_IN choreography", () => {
    it("gives every tier 0-4 a distinct, bespoke (non-generic) layer stack", () => {
      const genericById = new Map<number, string[]>();
      for (let tier = 0; tier <= 4; tier++) {
        const def = resolveAnimation("ALL_IN", tier);
        expect(def).toBeDefined();
        genericById.set(tier, def!.layers.map((l) => l.type));
      }
      // No two tiers share the exact same layer-type sequence (each is a real escalation step).
      const signatures = [...genericById.values()].map((types) => types.join(">"));
      expect(new Set(signatures).size).toBe(signatures.length);
    });

    it("does not reuse the plain generic TIER_0-3 presets used as fallback shapes elsewhere", () => {
      // The generic TIER_0-3 presets are: TIER_0=[TEXT], TIER_1=[FLASH,TEXT], TIER_2=[BURST,FLASH,TEXT],
      // TIER_3=[BURST,PARTICLES,FLASH,TEXT]. ALL_IN's bespoke presets must differ in shape.
      const genericShapes = [
        ["TEXT"],
        ["FLASH", "TEXT"],
        ["BURST", "FLASH", "TEXT"],
        ["BURST", "PARTICLES", "FLASH", "TEXT"],
      ];
      for (let tier = 0; tier <= 3; tier++) {
        const def = resolveAnimation("ALL_IN", tier);
        const shape = def!.layers.map((l) => l.type);
        expect(shape).not.toEqual(genericShapes[tier]);
      }
    });

    it("adds an anchored seat RING accent for tiers >=2 once payload.anchorSeat is present", () => {
      for (const tier of [0, 1]) {
        const def = resolveAnimation("ALL_IN", tier);
        expect(def!.layers.some((l) => l.type === "RING")).toBe(false);
      }
      for (const tier of [2, 3, 4]) {
        const def = resolveAnimation("ALL_IN", tier);
        const ring = def!.layers.find((l) => l.type === "RING");
        expect(ring).toBeDefined();
        expect(ring && "seatIndexFromPayload" in ring ? ring.seatIndexFromPayload : undefined).toBe(
          "anchorSeat"
        );
      }
    });
  });
});

