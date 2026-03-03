import { ImageBackground, Platform, View, type ViewStyle } from "react-native";
import { usePreferencesStore } from "@/stores/preferences.store";
import type { FeltGradient } from "@/stores/preferences.store";
import { getFeltImageSource } from "./feltImages";

/** Subtle radial (center glow) or linear gradient for photogenic table felt. Web only. */
function buildFeltGradientStyle(g: FeltGradient): ViewStyle {
  const isRadial = g.kind === "radial";
  const ellipse = "ellipse 92% 88% at 50% 50%";
  const colorStops =
    g.colors.length === 2
      ? g.colors.map((c) => `hsl(${c})`).join(", ")
      : g.colors
          .map((c, i) => {
            const pct = i === 0 ? 0 : i === g.colors.length - 1 ? 100 : Math.round((i / (g.colors.length - 1)) * 100);
            return `hsl(${c}) ${pct}%`;
          })
          .join(", ");
  const css = isRadial
    ? `radial-gradient(${ellipse}, ${colorStops})`
    : `linear-gradient(${g.angleDeg ?? 180}deg, ${colorStops})`;
  return { background: css } as ViewStyle;
}

export type FeltBackgroundProps = {
  style?: ViewStyle | ViewStyle[];
  className?: string;
  children?: React.ReactNode;
};

/** Renders felt as image, solid color, or subtle radial/linear gradient (gradient on web only; native uses solid). */
export function FeltBackground({ style, className, children }: FeltBackgroundProps) {
  const feltColor = usePreferencesStore((s) => s.feltColor);
  const feltGradient = usePreferencesStore((s) => s.feltGradient);
  const feltImageId = usePreferencesStore((s) => s.feltImageId);

  const imageSource = feltImageId ? getFeltImageSource(feltImageId) : null;

  if (imageSource) {
    return (
      <ImageBackground
        source={imageSource}
        resizeMode="cover"
        style={[{ flex: 1 }, style]}
        className={className}
        imageStyle={{ flex: 1 }}
      >
        {children}
      </ImageBackground>
    );
  }

  const solidStyle: ViewStyle = {
    backgroundColor: `hsl(${feltColor})`,
  };

  const gradient = feltGradient && feltGradient.colors.length >= 2 ? feltGradient : null;
  const gradientStyle: ViewStyle =
    Platform.OS === "web" && gradient
      ? buildFeltGradientStyle(gradient)
      : gradient
        ? { backgroundColor: `hsl(${gradient.colors[0]})` }
        : solidStyle;

  const resolvedStyle = gradient ? gradientStyle : solidStyle;

  return (
    <View
      collapsable={false}
      style={[resolvedStyle, style]}
      className={className}
    >
      {children}
    </View>
  );
}
