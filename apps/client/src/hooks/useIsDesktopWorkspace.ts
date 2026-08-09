import { useEffect, useState } from "react";
import { Platform, useWindowDimensions } from "react-native";

/** Desktop workspace shell (NavRail) begins here — not tablet. */
export const DESKTOP_WORKSPACE_MIN_WIDTH = 1024;

/** True when viewport is wide enough for the desktop shell. Shell/chrome only. */
export function useIsDesktopWorkspace(): boolean {
  const { width: rnWidth } = useWindowDimensions();
  const [webWidth, setWebWidth] = useState(() =>
    Platform.OS === "web" && typeof window !== "undefined" ? window.innerWidth : rnWidth,
  );

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    setWebWidth(window.innerWidth);
    const onResize = () => setWebWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const width = Platform.OS === "web" ? webWidth : rnWidth;
  return width >= DESKTOP_WORKSPACE_MIN_WIDTH;
}
