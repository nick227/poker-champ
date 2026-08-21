import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useChromeInsets } from "@/components/containers/ChromeInsets";
import { Surface } from "@/components/containers/Surface";
import { BootPreloader, BOOT_FADE_IN_MS } from "@/components/domain/loading/BootPreloader";

type ScreenProps = {
  children: ReactNode;
  /**
   * Controls content reveal behind the shared boot veil.
   * Omit (or pass true) for immediate show; pass latched `usePageBoot(...)` on primary pages.
   */
  ready?: boolean;
  fadeInMs?: number;
  reducedMotion?: boolean;
};

/** Single View + insets; optional BootPreloader gates first paint. */
export function Screen({
  children,
  ready = true,
  fadeInMs = BOOT_FADE_IN_MS,
  reducedMotion: reducedMotionProp,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const chrome = useChromeInsets();
  const [reducedMotionSystem, setReducedMotionSystem] = useState(false);

  useEffect(() => {
    if (reducedMotionProp != null) return;
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReducedMotionSystem(v);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotionSystem);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, [reducedMotionProp]);

  const reducedMotion = reducedMotionProp ?? reducedMotionSystem;

  return (
    <Surface as={View} styleId="surface.screen.base">
      <View
        style={{
          flex: 1,
          paddingTop: chrome.topConsumed ? 0 : insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        <BootPreloader ready={ready} reducedMotion={reducedMotion} fadeInMs={fadeInMs}>
          {children}
        </BootPreloader>
      </View>
    </Surface>
  );
}
