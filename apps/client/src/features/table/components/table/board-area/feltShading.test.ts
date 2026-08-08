import { describe, expect, it } from "vitest";
import type { ResolvedBackground } from "@/theme/backgrounds/background.types";
import {
  buildFeltRadialGradientCss,
  buildFeltShadingStops,
  hslTripletToCss,
  parseHslTriplet,
  resolveFeltShadingBase,
} from "./feltShading";

describe("parseHslTriplet", () => {
  it("parses the app's 'H S% L%' felt color format", () => {
    expect(parseHslTriplet("158 30% 14%")).toEqual({ h: 158, s: 30, l: 14 });
  });

  it("returns null for malformed input", () => {
    expect(parseHslTriplet("not a color")).toBeNull();
    expect(parseHslTriplet(null)).toBeNull();
    expect(parseHslTriplet(undefined)).toBeNull();
    expect(parseHslTriplet("")).toBeNull();
  });
});

describe("hslTripletToCss", () => {
  it("renders a valid hsl() string", () => {
    expect(hslTripletToCss({ h: 158, s: 30, l: 14 })).toBe("hsl(158, 30%, 14%)");
  });

  it("clamps saturation/lightness into 0-100", () => {
    expect(hslTripletToCss({ h: 0, s: 120, l: -5 })).toBe("hsl(0, 100%, 0%)");
  });
});

describe("buildFeltShadingStops", () => {
  it("builds a brighter center and darker edge than the base lightness", () => {
    const base = { h: 158, s: 30, l: 14 };
    const stops = buildFeltShadingStops(base);
    const lightnessOf = (css: string) => Number(/,\s*(\d+)%\)$/.exec(css)?.[1]);
    expect(lightnessOf(stops.center)).toBeGreaterThan(lightnessOf(stops.mid));
    expect(lightnessOf(stops.mid)).toBeGreaterThan(lightnessOf(stops.edge));
  });

  it("clamps stops to the 0-100 lightness range for extreme bases", () => {
    const stops = buildFeltShadingStops({ h: 0, s: 0, l: 98 });
    expect(stops.center).toBe("hsl(0, 0%, 100%)");
  });
});

describe("resolveFeltShadingBase", () => {
  it("derives the base tone from a resolved color background and tints the radial", () => {
    const resolved: ResolvedBackground = { kind: "color", color: "0 80% 50%" };
    expect(resolveFeltShadingBase(resolved)).toEqual({ base: { h: 0, s: 80, l: 50 }, showTintedRadial: true });
  });

  it("derives the base tone from the gradient's first stop", () => {
    const resolved: ResolvedBackground = {
      kind: "gradient",
      color: null,
      gradient: { colors: ["220 40% 30%", "220 40% 10%"] },
    };
    expect(resolveFeltShadingBase(resolved)).toEqual({ base: { h: 220, s: 40, l: 30 }, showTintedRadial: true });
  });

  it("skips the tinted radial for image-backed felt so the real texture shows through", () => {
    const resolved: ResolvedBackground = { kind: "image", color: null, imageId: "green", size: "cover" };
    expect(resolveFeltShadingBase(resolved).showTintedRadial).toBe(false);
  });

  it("falls back to the default felt tone for 'none' or missing resolution", () => {
    expect(resolveFeltShadingBase({ kind: "none", color: null }).showTintedRadial).toBe(true);
    expect(resolveFeltShadingBase(undefined).showTintedRadial).toBe(true);
  });
});

describe("buildFeltRadialGradientCss", () => {
  it("produces a radial-gradient() string containing all three stops", () => {
    const stops = { center: "hsl(1,1%,1%)", mid: "hsl(2,2%,2%)", edge: "hsl(3,3%,3%)" };
    const css = buildFeltRadialGradientCss(stops);
    expect(css).toContain("radial-gradient(");
    expect(css).toContain(stops.center);
    expect(css).toContain(stops.mid);
    expect(css).toContain(stops.edge);
  });
});
