import { ImageBackground, Platform, View, type ViewStyle } from "react-native";
import { usePreferencesStore } from "@/stores/preferences.store";
import { resolveBackground } from "@/theme/backgrounds";
import { resolvedToNativeProps } from "@/theme/backgrounds/background.native";
import { resolvedToBodyStyle } from "@/theme/backgrounds/background.web";
import { useIsMobile } from "@/hooks/useIsMobile";
import { getFeltImageSource } from "../feltImages";
import { getFeltGeometry } from "../tokens/felt.tokens";
import { TableFeltSurface } from "./TableFeltSurface";

export type FeltBackgroundProps = {
  style?: ViewStyle | ViewStyle[];
  className?: string;
  children?: React.ReactNode;
};

const BASE_STYLE: ViewStyle = { width: "100%", alignSelf: "stretch" };

/**
 * Renders the felt table surface: the user's chosen fill (image/color/gradient, via the shared
 * theme resolver) plus a procedural table-surface illusion layered on top — an oval rail, radial
 * shading, and a soft vignette — built from CSS/shapes only (see TableFeltSurface). The outer
 * container's own corner radius matches the rail's so the base fill never peeks out past it.
 */
export function FeltBackground({ style, className, children }: FeltBackgroundProps) {
  const feltBackground = usePreferencesStore((s) => s.feltBackground);
  const resolved = resolveBackground(feltBackground, "felt");
  const compact = useIsMobile();
  const { radius } = getFeltGeometry(compact);
  const shapeStyle: ViewStyle = { borderRadius: radius, overflow: "hidden" };

  if (resolved.kind === "image") {
    const source = getFeltImageSource(resolved.imageId);
    if (source) {
      return (
        <ImageBackground
          source={source}
          resizeMode={resolved.size}
          style={[BASE_STYLE, shapeStyle, style]}
          className={className}
          imageStyle={{ flex: 1 }}
        >
          <TableFeltSurface resolved={resolved} compact={compact} />
          {children}
        </ImageBackground>
      );
    }
  }

  const viewStyle: ViewStyle =
    Platform.OS === "web"
      ? (resolvedToBodyStyle(resolved, () => null) as ViewStyle)
      : resolvedToNativeProps(resolved, (id) => getFeltImageSource(id)).style;

  return (
    <View
      collapsable={false}
      style={[BASE_STYLE, viewStyle, shapeStyle, style]}
      className={className}
    >
      <TableFeltSurface resolved={resolved} compact={compact} />
      {children}
    </View>
  );
}
