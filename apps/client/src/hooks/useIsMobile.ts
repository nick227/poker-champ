import { useState, useEffect } from "react";
import { Platform, useWindowDimensions } from "react-native";

const MOBILE_BREAKPOINT = 768;

/** Uses viewport width on web so desktop isn't misdetected as mobile. */
export function useIsMobile(): boolean {
  const { width: rnWidth } = useWindowDimensions();
  const [webWidth, setWebWidth] = useState(() =>
    Platform.OS === "web" && typeof window !== "undefined" ? window.innerWidth : rnWidth
  );
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    setWebWidth(window.innerWidth);
    const onResize = () => setWebWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const width = Platform.OS === "web" ? webWidth : rnWidth;
  return width < MOBILE_BREAKPOINT;
}
