import { describe, expect, it, vi } from "vitest";
import { isValidElement } from "react";
import type { AnimationLayerDefinition, TableAnimationRequest } from "../animationTypes";
import type { AnimationTheme } from "../animationTheme";
import { ANIMATION_THEME_VERSION } from "../animationTheme";
import { renderAnimationLayer } from "../renderAnimationLayer";

vi.mock("react-native", () => {
  const Easing = {
    cubic: (t: number) => t,
    quad: (t: number) => t,
    out: (fn: (t: number) => number) => fn,
    in: (fn: (t: number) => number) => fn,
  };
  const Animated = {
    Value: class Value {
      constructor(_v: number) {}
    },
    timing: (_value: unknown, _config: unknown) => ({ start: (cb?: () => void) => cb?.() }),
    sequence: (_anims: unknown[]) => ({ start: (cb?: () => void) => cb?.() }),
    parallel: (_anims: unknown[]) => ({ start: (cb?: () => void) => cb?.() }),
  };
  const StyleSheet = {
    absoluteFill: {},
    create: (styles: Record<string, unknown>) => styles,
  };
  const View = (_props: unknown) => null;
  const Text = (_props: unknown) => null;
  return { Easing, Animated, StyleSheet, View, Text };
});

const theme: AnimationTheme = {
  version: ANIMATION_THEME_VERSION,
  palette: {
    flash: "white",
    burst: "gold",
    particle: "gold",
    ring: "gold",
    streakColor: "gold",
    headline: "white",
    headlineGlow: "white",
    headlineGlowSecondary: "white",
    headlineGlowBright: "white",
    amountBg: "black",
    amountText: "white",
    amountBorder: "white",
    haloColor: "gold",
  },
  timing: {
    flashDurationMs: 300,
    burstScale: [0.8, 1.2] as [number, number],
    ringScale: [0.8, 1.1] as [number, number],
  },
  textScale: {
    small: 12,
    medium: 16,
    large: 20,
    xlarge: 28,
    hero: 36,
  },
};

describe("renderAnimationLayer", () => {
  it("renders procedural layers as React elements", () => {
    const layer: AnimationLayerDefinition = { type: "FLASH", durationMs: 100 };
    const node = renderAnimationLayer(layer, 0, undefined, "", theme);
    expect(isValidElement(node)).toBe(true);
  });

  it("returns null for TEXT when text resolves empty", () => {
    const payload: TableAnimationRequest["payload"] = { headline: "" };
    const layer: AnimationLayerDefinition = { type: "TEXT", textRole: "headline" };
    const node = renderAnimationLayer(layer, 0, payload, "", theme);
    expect(node).toBeNull();
  });

  it("returns null for ASSET when source is empty", () => {
    const layer = { type: "ASSET", assetType: "VIDEO", source: "" } as unknown as AnimationLayerDefinition;
    const node = renderAnimationLayer(layer, 0, undefined, "", theme);
    expect(node).toBeNull();
  });

  it("passes the full [min, max] opacity tuple through to RADIAL_GLOW (regression: used to truncate to opacity[0])", () => {
    const layer: AnimationLayerDefinition = {
      type: "RADIAL_GLOW",
      durationMs: 1800,
      opacity: [0.06, 0.14],
    };
    const node = renderAnimationLayer(layer, 0, undefined, "", theme) as { props: { opacity?: [number, number] } };
    expect(node.props.opacity).toEqual([0.06, 0.14]);
  });

  it("passes opacity undefined through to RADIAL_GLOW when the layer omits it", () => {
    const layer: AnimationLayerDefinition = { type: "RADIAL_GLOW", durationMs: 1800 };
    const node = renderAnimationLayer(layer, 0, undefined, "", theme) as { props: { opacity?: [number, number] } };
    expect(node.props.opacity).toBeUndefined();
  });
});

