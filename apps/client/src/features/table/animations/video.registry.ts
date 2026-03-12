import type { AnimationAssetType } from "./animationTypes";

export type VideoAssetKey = "casino";

type VideoAssetDefinition = {
  key: VideoAssetKey;
  assetType: AnimationAssetType;
  /** Static require so Metro/Expo bundles the asset. */
  module: number;
};

const VIDEO_ASSETS: Record<VideoAssetKey, VideoAssetDefinition> = {
  casino: {
    key: "casino",
    assetType: "VIDEO",
    module: require("../../../../assets/effects/casino.webm"),
  },
};

export function getVideoAsset(key: string): VideoAssetDefinition | undefined {
  if (!(key in VIDEO_ASSETS)) return undefined;
  return VIDEO_ASSETS[key as VideoAssetKey];
}

