import { useEffect, useRef } from "react";
import { View } from "react-native";
import { Video } from "expo-av";
import type { AnimationAssetType } from "../animationTypes";
import { getVideoAsset } from "../video.registry";

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

export function AssetLayer({
  assetType,
  source,
  delayMs = 0,
  durationMs = 800,
  onReady,
  onEnd,
}: AssetLayerProps) {
  const mounted = useRef(true);
  const videoRef = useRef<Video | null>(null);

  const resolvedSource = (() => {
    if (!source?.trim()) return undefined;
    if (assetType === "VIDEO") {
      const asset = getVideoAsset(source);
      if (asset?.module != null) return asset.module;
    }
    return { uri: source };
  })();

  useEffect(() => {
    if (!resolvedSource) {
      onEnd?.();
      return;
    }
    let endTimeout: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      if (!mounted.current) return;
      onReady?.();
      endTimeout = setTimeout(() => {
        if (!mounted.current) return;
        onEnd?.();
      }, durationMs);
    };
    const delayTimeout = delayMs > 0 ? setTimeout(start, delayMs) : (start(), undefined);
    return () => {
      if (delayTimeout != null) clearTimeout(delayTimeout);
      if (endTimeout != null) clearTimeout(endTimeout);
    };
  }, [resolvedSource, delayMs, durationMs, onReady, onEnd]);

  if (!resolvedSource) return null;
  if (assetType === "VIDEO") {
    return (
      <Video
        ref={videoRef}
        style={{ flex: 1 }}
        pointerEvents="none"
        source={resolvedSource}
        resizeMode="cover"
        isLooping={false}
        shouldPlay
        onPlaybackStatusUpdate={(status) => {
          if (!mounted.current) return;
          if ("didJustFinish" in status && status.didJustFinish) {
            onEnd?.();
          }
        }}
      />
    );
  }
  return <View style={{ flex: 1 }} pointerEvents="none" />;
}
