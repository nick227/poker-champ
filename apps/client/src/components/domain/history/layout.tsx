
import type { ViewStyle } from "react-native";

export type Span = "half" | "third" | "full";

export const SPAN_STYLE: Record<Span, ViewStyle> = {
  third: { width: "33.3333%", flexShrink: 0 },
  half: { width: "50%", flexShrink: 0 },
  full: { width: "100%", flexShrink: 0 },
};
