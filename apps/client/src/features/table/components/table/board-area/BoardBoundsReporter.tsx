/**
 * Reports bounds (e.g. measureInWindow) for overlay anchoring.
 * Prefer overlay coordinate space (measureLayout(overlayRef)) when available.
 */
import type { ReactNode } from "react";
import { useRef } from "react";
import { View, type ViewStyle } from "react-native";
import type { Rect } from "@/features/table/animations/animationTypes";

export type MeasuredBoundsReporterProps = {
  children: ReactNode;
  onBounds: (rect: Rect) => void;
  /** Optional; default { flex: 1 } for full-width/height wrappers. */
  style?: ViewStyle;
};

export function MeasuredBoundsReporter({ children, onBounds, style }: MeasuredBoundsReporterProps) {
  const ref = useRef<View>(null);
  const handleLayout = () => {
    ref.current?.measureInWindow((x, y, width, height) => {
      onBounds({ x, y, width, height });
    });
  };
  return (
    <View ref={ref} collapsable={false} onLayout={handleLayout} style={style ?? { flex: 1 }}>
      {children}
    </View>
  );
}

export type BoardBoundsReporterProps = {
  children: ReactNode;
  onBoardBounds: (rect: Rect) => void;
};

/** Wraps board area and reports bounds for BOARD-anchored FX. */
export function BoardBoundsReporter({ children, onBoardBounds }: BoardBoundsReporterProps) {
  return <MeasuredBoundsReporter onBounds={onBoardBounds}>{children}</MeasuredBoundsReporter>;
}
