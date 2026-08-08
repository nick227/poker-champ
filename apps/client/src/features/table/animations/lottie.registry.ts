/**
 * Lottie asset registry — mirrors video.registry.ts's shape so LOTTIE asset layers have
 * the same "key → bundled asset" lookup as VIDEO once real .json files are produced.
 * Intentionally empty: no Lottie assets are shipped yet. See LottieAssetLayer.tsx for
 * what's needed to enable real playback (adding `lottie-react-native` + a native rebuild).
 */
export type LottieAssetKey = string;

export type LottieAssetDefinition = {
  key: LottieAssetKey;
  /** Static require so Metro/Expo bundles the asset once lottie-react-native is installed. */
  source: unknown;
};

const LOTTIE_ASSETS: Record<string, LottieAssetDefinition> = {
  // Register real Lottie JSON assets here, e.g.:
  // dealChip: { key: "dealChip", source: require("../../../../assets/effects/deal-chip.json") },
};

export function getLottieAsset(key: string): LottieAssetDefinition | undefined {
  if (!(key in LOTTIE_ASSETS)) return undefined;
  return LOTTIE_ASSETS[key];
}
