/**
 * Lottie playback plumbing — not yet wired to a live renderer.
 *
 * `lottie-react-native` is not currently an installed dependency, and adding it requires
 * a native rebuild (pod install / gradle sync) this environment can't validate. Importing
 * it here unconditionally would break the Metro bundle for everyone, so this component
 * defines the real interface (asset registry lookup, mount lifecycle, dev-only missing-key
 * warning) and stops short of the actual render. Wiring in real playback once the follow-up
 * content/dependency work lands is a small, mechanical change:
 *
 *   1. `npx expo install lottie-react-native` (+ native rebuild)
 *   2. `import LottieView from "lottie-react-native"`
 *   3. Replace the `<View>` fallback below with:
 *        <LottieView source={asset.source} autoPlay loop={false} style={{ flex: 1 }}
 *          onAnimationFinish={onEnd} />
 *
 * Until then this renders nothing (matches prior AssetLayer stub behavior for LOTTIE),
 * but the registry, lookup, and lifecycle wiring are real.
 */
import { useEffect } from "react";
import { View } from "react-native";
import { getLottieAsset } from "../lottie.registry";

export type LottieAssetLayerProps = {
  source: string;
};

/**
 * Mount/unmount lifecycle (onReady/onEnd) is owned by the parent AssetLayer's shared timer,
 * same as the VIDEO path's delay handling — this component only resolves the asset and renders.
 */
export function LottieAssetLayer({ source }: LottieAssetLayerProps) {
  const asset = getLottieAsset(source);

  useEffect(() => {
    if (__DEV__ && source && !asset) {
      console.warn(
        `[TableAnimation] Unknown Lottie asset key: "${source}". Register it in lottie.registry.ts.`,
      );
    }
  }, [source, asset]);

  return <View style={{ flex: 1 }} pointerEvents="none" />;
}
