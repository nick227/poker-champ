/**
 * @vitest-environment happy-dom
 *
 * Smoke test for the chip-travel queue/render wiring (not pixel-perfect visual testing —
 * see chipTravel.test.ts for the from/to/duration logic this component consumes).
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { ChipTravelPlan } from "../chipTravel";

vi.mock("react-native", () => {
  function normalizeStyle(style: unknown): Record<string, unknown> {
    if (style == null) return {};
    if (Array.isArray(style)) return Object.assign({}, ...style.map(normalizeStyle));
    return typeof style === "object" ? (style as Record<string, unknown>) : {};
  }
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
    View: ({ children, style }: { children?: unknown; style?: unknown }) => (
      <div style={normalizeStyle(style) as never}>{children as never}</div>
    ),
  };
  const StyleSheet = {
    absoluteFill: {},
    create: (styles: Record<string, unknown>) => styles,
  };
  const View = ({ children, style, testID }: { children?: unknown; style?: unknown; testID?: string }) => (
    <div data-testid={testID} style={normalizeStyle(style) as never}>
      {children as never}
    </div>
  );
  return { Easing, Animated, StyleSheet, View };
});

vi.mock("../layers/ChipToken", () => ({
  ChipToken: () => <div data-testid="chip-token" />,
}));

import { ChipTravelOverlay } from "../ChipTravelOverlay";

const plan: ChipTravelPlan = {
  id: "chip-1",
  from: { x: 0, y: 0, width: 40, height: 40 },
  to: { x: 100, y: 100, width: 40, height: 40 },
  amountCents: 500,
  chipCount: 3,
  durationMs: 300,
};

describe("ChipTravelOverlay", () => {
  it("renders nothing when there are no active requests", () => {
    const { container } = render(<ChipTravelOverlay requests={[]} onRequestComplete={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders exactly plan.chipCount chip tokens for an active request", () => {
    const { container } = render(<ChipTravelOverlay requests={[plan]} onRequestComplete={() => {}} />);
    expect(container.querySelectorAll("[data-testid='chip-token']").length).toBe(plan.chipCount);
  });

  it("renders one chip-token group per active plan (multiple concurrent travels)", () => {
    const secondPlan: ChipTravelPlan = { ...plan, id: "chip-2", chipCount: 2 };
    const { container } = render(
      <ChipTravelOverlay requests={[plan, secondPlan]} onRequestComplete={() => {}} />,
    );
    expect(container.querySelectorAll("[data-testid='chip-token']").length).toBe(
      plan.chipCount + secondPlan.chipCount,
    );
  });

  it("calls onRequestComplete once the plan's total travel time elapses", () => {
    vi.useFakeTimers();
    const onRequestComplete = vi.fn();
    render(<ChipTravelOverlay requests={[plan]} onRequestComplete={onRequestComplete} />);
    expect(onRequestComplete).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(onRequestComplete).toHaveBeenCalledWith("chip-1");
    vi.useRealTimers();
  });
});
