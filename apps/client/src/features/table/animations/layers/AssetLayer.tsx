import { useEffect, useRef } from "react";
import { View } from "react-native";
import type { AnimationAssetType } from "../animationTypes";

type AssetLayerProps = {
  assetType: AnimationAssetType;
  source: string;
  variant?: string;
  containsAudio?: boolean;
  delayMs?: number;
  durationMs?: number;
  onReady?: () => void;
  onEnd?: () => void;
};

/**
 * Stub for ASSET layer (VIDEO | LOTTIE | SPRITE).
 * Placeholder until Phase 2: real playback will call onReady/onEnd; overlay contract unchanged.
 * When source is empty or load fails, render nothing (no crash).
 */
export function AssetLayer({
  source,
  delayMs = 0,
  durationMs = 800,
  onReady,
  onEnd,
}: AssetLayerProps) {
  const mounted = useRef(true);

  useEffect(() => {
    if (!source?.trim()) {
      onEnd?.();
      return;
    }
    let endTimeout: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      if (!mounted.current) return;
      onReady?.();
      // Phase 2: real playback will call onEnd when asset finishes
      endTimeout = setTimeout(() => onEnd?.(), durationMs);
    };
    const delayTimeout = delayMs > 0 ? setTimeout(start, delayMs) : (start(), undefined);
    return () => {
      mounted.current = false;
      if (delayTimeout != null) clearTimeout(delayTimeout);
      if (endTimeout != null) clearTimeout(endTimeout);
    };
  }, [source, delayMs, durationMs, onReady, onEnd]);

  if (!source?.trim()) return null;
  return <View style={{ flex: 1 }} pointerEvents="none" />;
}
