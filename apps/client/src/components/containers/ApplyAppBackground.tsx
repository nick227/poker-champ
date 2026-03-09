import { useLayoutEffect, type ReactNode } from "react";
import { ImageBackground, Platform, View } from "react-native";
import type { ViewStyle } from "react-native";
import { usePreferencesStore } from "@/stores/preferences.store";
import { resolveBackground } from "@/theme/backgrounds";
import { resolvedToNativeProps } from "@/theme/backgrounds/background.native";
import { resolvedToBodyStyle } from "@/theme/backgrounds/background.web";
import { getBackgroundImageUrl } from "@/theme/backgrounds/getBackgroundImageUrl.web";
import { getFeltImageSource } from "@/components/domain/table/feltImages";

type ApplyAppBackgroundProps = {
  children: ReactNode;
};

const rootLayout: ViewStyle = { flex: 1, minHeight: "100%" };

/** Web: explicit width + full height so background-size 100% 100% has a surface to paint. */
const webRootLayout: ViewStyle = {
  flex: 1,
  width: "100%",
  minHeight: "100%",
};

const WEB_BG_KEYS = [
  "background",
  "background-color",
  "background-image",
  "background-size",
  "background-repeat",
  "background-position",
] as const;

function toCssProp(name: string): string {
  return name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/**
 * App background on the root container. Web: View with CSS background (no img tag).
 * Native: ImageBackground or View from resolvedToNativeProps.
 */
export function ApplyAppBackground({ children }: ApplyAppBackgroundProps) {
  const appBackground = usePreferencesStore((s) => s.appBackground);
  const resolved = resolveBackground(appBackground, "app");
  const webStyle = Platform.OS === "web" ? resolvedToBodyStyle(resolved, getBackgroundImageUrl) : null;
  const webStyleKey = Platform.OS === "web" ? JSON.stringify(webStyle) : "";
  const resolvedKey = Platform.OS === "web" ? JSON.stringify(resolved) : "";

  useLayoutEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || webStyle == null) return;
    const root = document.getElementById("root");
    const targets = [document.body, root].filter(Boolean) as HTMLElement[];
    for (const target of targets) {
      for (const key of WEB_BG_KEYS) {
        target.style.removeProperty(key);
      }
      for (const [name, value] of Object.entries(webStyle)) {
        target.style.setProperty(toCssProp(name), value);
      }
    }
    if (process.env.NODE_ENV !== "production") {
      const html = document.documentElement;
      html.dataset.appBgResolved = resolved.kind;
      html.dataset.appBgStyle = webStyleKey;
      html.dataset.appBgState = JSON.stringify(appBackground);
    }
  }, [webStyleKey, resolvedKey, appBackground]);

  if (Platform.OS === "web") {
    return (
      <View className="main-wrapper" style={[webRootLayout, (webStyle ?? {}) as ViewStyle]}>
        {children}
      </View>
    );
  }

  const props = resolvedToNativeProps(resolved, (id) => getFeltImageSource(id));
  if (props.imageSource != null) {
    return (
      <ImageBackground
        source={props.imageSource}
        resizeMode={props.resizeMode ?? "cover"}
        style={rootLayout}
      >
        {children}
      </ImageBackground>
    );
  }
  return <View style={[rootLayout, props.style]}>{children}</View>;
}
