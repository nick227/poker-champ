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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_v: number) {}
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    timing: (_value: unknown, _config: unknown) => ({ start: (cb?: () => void) => cb?.() }),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    sequence: (_anims: unknown[]) => ({ start: (cb?: () => void) => cb?.() }),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    parallel: (_anims: unknown[]) => ({ start: (cb?: () => void) => cb?.() }),
  };
  const StyleSheet = {
    absoluteFill: {},
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
});

