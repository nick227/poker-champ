import { Platform, type TextStyle } from "react-native";

type TextShadowInput = {
  color: string;
  offset?: { width: number; height: number };
  radius?: number;
};

/** Cross-platform text shadow: CSS `textShadow` on web, RN split props elsewhere. */
export function textShadowStyle({
  color,
  offset = { width: 0, height: 0 },
  radius = 0,
}: TextShadowInput): TextStyle {
  if (Platform.OS === "web") {
    return {
      // RN Web deprecated textShadowColor/Offset/Radius in favor of CSS textShadow.
      textShadow: `${offset.width}px ${offset.height}px ${radius}px ${color}`,
    } as TextStyle;
  }
  return {
    textShadowColor: color,
    textShadowOffset: offset,
    textShadowRadius: radius,
  };
}
