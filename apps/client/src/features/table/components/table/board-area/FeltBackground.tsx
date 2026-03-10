import { ImageBackground, Platform, View, type ViewStyle } from "react-native";
import { usePreferencesStore } from "@/stores/preferences.store";
import { resolveBackground } from "@/theme/backgrounds";
import { resolvedToNativeProps } from "@/theme/backgrounds/background.native";
import { resolvedToBodyStyle } from "@/theme/backgrounds/background.web";
import { getFeltImageSource } from "../feltImages";

export type FeltBackgroundProps = {
  style?: ViewStyle | ViewStyle[];
  className?: string;
  children?: React.ReactNode;
};

const BASE_STYLE: ViewStyle = { width: "100%", alignSelf: "stretch" };

/** Renders felt from shared resolver: image (cover), color, or gradient (web only; native uses first color). */
export function FeltBackground({ style, className, children }: FeltBackgroundProps) {
  const feltBackground = usePreferencesStore((s) => s.feltBackground);
  const resolved = resolveBackground(feltBackground, "felt");

  if (resolved.kind === "image") {
    const source = getFeltImageSource(resolved.imageId);
    if (source) {
      return (
        <ImageBackground
          source={source}
          resizeMode={resolved.size}
          style={[BASE_STYLE, style]}
          className={className}
          imageStyle={{ flex: 1 }}
        >
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
      style={[BASE_STYLE, viewStyle, style]}
      className={className}
    >
      {children}
    </View>
  );
}
