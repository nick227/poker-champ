import type { ImageSourcePropType } from "react-native";

/** Built-in felt background image ids. Add entries here and under FELT_IMAGES to support image felt. */
export type FeltImageId = "texture" | "purple-bubbles";

const FELT_IMAGES: Record<FeltImageId, ImageSourcePropType> = {
  texture: require("../../../../assets/backgrounds/cardlogo.jpg"),
  "purple-bubbles": require("../../../../assets/backgrounds/purple-bubbles.webp"),
};

export function getFeltImageSource(id: string): ImageSourcePropType | null {
  return Object.prototype.hasOwnProperty.call(FELT_IMAGES, id)
    ? (FELT_IMAGES as Record<string, ImageSourcePropType>)[id]
    : null;
}
