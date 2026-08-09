/**
 * @vitest-environment happy-dom
 *
 * Covers the measurement mechanism reused for BOARD, HERO, SEAT, and CARD anchor bounds
 * (useActiveTableSlots wraps HeroZone with this same MeasuredBoundsReporter; CommunityBoard
 * wraps each card slot with it; BoardBoundsReporter wraps the board area with it).
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { forwardRef, useEffect, useImperativeHandle, type ReactNode } from "react";

const MEASURED_RECT = { x: 10, y: 20, width: 300, height: 150 };

vi.mock("react-native", () => {
  const View = forwardRef<{ measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void }, {
    children?: ReactNode;
    onLayout?: () => void;
    collapsable?: boolean;
    style?: unknown;
  }>(({ children, onLayout }, ref) => {
    useImperativeHandle(ref, () => ({
      measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => {
        cb(MEASURED_RECT.x, MEASURED_RECT.y, MEASURED_RECT.width, MEASURED_RECT.height);
      },
    }));
    useEffect(() => {
      onLayout?.();
    }, [onLayout]);
    return <div>{children}</div>;
  });
  View.displayName = "MockView";
  return { View };
});

import { BoardBoundsReporter, MeasuredBoundsReporter } from "./BoardBoundsReporter";

describe("MeasuredBoundsReporter", () => {
  it("reports the measured rect via onBounds on layout", () => {
    const onBounds = vi.fn();
    render(
      <MeasuredBoundsReporter onBounds={onBounds}>
        <span>content</span>
      </MeasuredBoundsReporter>,
    );
    expect(onBounds).toHaveBeenCalledTimes(1);
    expect(onBounds).toHaveBeenCalledWith(MEASURED_RECT);
  });

  it("is the same mechanism BoardBoundsReporter uses for onBoardBounds", () => {
    const onBoardBounds = vi.fn();
    render(
      <BoardBoundsReporter onBoardBounds={onBoardBounds}>
        <span>board</span>
      </BoardBoundsReporter>,
    );
    expect(onBoardBounds).toHaveBeenCalledWith(MEASURED_RECT);
  });
});
