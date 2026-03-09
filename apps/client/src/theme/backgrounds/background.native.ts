import type { ImageSourcePropType } from "react-native";
import type { BackgroundImageId } from "./background.types";
import type { ResolvedBackground } from "./background.types";
import type { ViewStyle } from "react-native";

export type GetBackgroundImageSource = (id: BackgroundImageId) => ImageSourcePropType | null;

export type NativeBackgroundProps = {
  style: ViewStyle;
  imageSource?: ImageSourcePropType;
  resizeMode?: "cover" | "stretch";
};

/**
 * Converts ResolvedBackground to native View / ImageBackground props.
 * Gradient: native has no ViewStyle gradient support, so we use gradient.primaryColor
 * (first color). See background.resolver.ts for the resolution contract.
 */
export function resolvedToNativeProps(
  resolved: ResolvedBackground,
  getImageSource: GetBackgroundImageSource
): NativeBackgroundProps {
  switch (resolved.kind) {
    case "none":
      return {
        style: {
          backgroundColor: resolved.color != null ? `hsl(${resolved.color})` : "transparent",
        },
      };
    case "color":
      return { style: { backgroundColor: `hsl(${resolved.color})` } };
    case "gradient": {
      const first = resolved.gradient.colors[0];
      return {
        style: { backgroundColor: first ? `hsl(${first})` : "transparent" },
      };
    }
    case "image": {
      const source = getImageSource(resolved.imageId);
      const fallbackColor = resolved.color != null ? `hsl(${resolved.color})` : "transparent";
      if (!source) {
        return { style: { backgroundColor: fallbackColor } };
      }
      return {
        style: {},
        imageSource: source,
        resizeMode: resolved.size,
      };
    }
  }
}
