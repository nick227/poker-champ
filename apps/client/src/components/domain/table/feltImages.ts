import type { ImageSourcePropType } from "react-native";

/** Built-in felt background image ids. Add entries here and under FELT_IMAGES to support image felt. */
export type FeltImageId = "texture";

const FELT_IMAGES: Record<FeltImageId, ImageSourcePropType> = {
  texture: require("../../../../assets/images/cardlogo.jpg"),
};

export function getFeltImageSource(id: string): ImageSourcePropType | null {
  return Object.prototype.hasOwnProperty.call(FELT_IMAGES, id)
    ? (FELT_IMAGES as Record<string, ImageSourcePropType>)[id]
    : null;
}
