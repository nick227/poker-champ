import type { ReactNode } from "react";
import { ImageBackground, Platform, View } from "react-native";
import type { ViewStyle } from "react-native";
import { usePreferencesStore } from "@/stores/preferences.store";
import { resolveBackground } from "@/theme/backgrounds";
import { resolvedToNativeProps } from "@/theme/backgrounds/background.native";
import { resolvedToBodyStyle } from "@/theme/backgrounds/background.web";
import { getBackgroundImageUrl } from "@/theme/backgrounds/getBackgroundImageUrl.web";
import { getFeltImageSource } from "@/components/domain/table/feltImages";

type AppPageRootProps = { children: ReactNode };

const nativePageStyle: ViewStyle = { flex: 1, minHeight: "100%" };

function useResolvedAppBackground() {
  const appBackground = usePreferencesStore((s) => s.appBackground);
  const resolved = resolveBackground(appBackground, "app");
  const webStyle =
    Platform.OS === "web" ? resolvedToBodyStyle(resolved, getBackgroundImageUrl) : null;
  const nativeProps = resolvedToNativeProps(resolved, (id) => getFeltImageSource(id));
  return { resolved, webStyle, nativeProps };
}

/**
 * Page root: full viewport container (background) + content width constraint.
 * Background applied only here; no DOM mutation. Platform only changes render type.
 */
export function AppPageRoot({ children }: AppPageRootProps) {
  const { webStyle, nativeProps } = useResolvedAppBackground();

  if (Platform.OS === "web") {
    return (
      <View
        dataSet={{ appPage: true }}
        className="app-page"
        style={(webStyle ?? {}) as ViewStyle}
      >
        <View className="app-content">{children}</View>
      </View>
    );
  }

  if (nativeProps.imageSource != null) {
    return (
      <ImageBackground
        source={nativeProps.imageSource}
        resizeMode={nativeProps.resizeMode ?? "cover"}
        style={nativePageStyle}
      >
        <View style={nativePageStyle}>{children}</View>
      </ImageBackground>
    );
  }
  return (
    <View style={[nativePageStyle, nativeProps.style]}>
      <View style={nativePageStyle}>{children}</View>
    </View>
  );
}
