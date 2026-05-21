import type { BackgroundImageId } from "./background.types";
import { getFeltImageSource } from "@/features/table/components/table/feltImages";

/**
 * Returns a URL for the given background image id, for use in web CSS (e.g. background-image: url(...)).
 * Web only: Image.resolveAssetSource is not supported on RN Web, so we use expo-asset which uses
 * the asset registry and works with Metro web.
 */
export function getBackgroundImageUrl(imageId: BackgroundImageId): string | null {
  const source = getFeltImageSource(imageId);
  if (source == null) return null;
  if (typeof source === "string") return source;
  if (typeof source === "object" && source !== null && "uri" in source) {
    const uri = (source as { uri: string }).uri;
    return typeof uri === "string" ? uri : null;
  }
  if (typeof source === "number") {
    try {
      const { Asset } = require("expo-asset");
      const asset = Asset.fromModule(source);
      return asset?.uri ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

