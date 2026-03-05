import type { ImageSourcePropType } from "react-native";

/**
 * Single source of truth for table background images.
 * To add a new image: place the file under assets/backgrounds/, then add one entry below
 * (id, name, source). It will appear in the felt picker and can be used as themePackConfig.feltImageId.
 * poker_table_green_surface_texture_full-screen.png
 */
const FELT_BACKGROUND_IMAGES = [
  {
    id: "texture" as const,
    name: "Texture",
    source: require("../../../../assets/backgrounds/poker_grime_03.png"),
  },
  {
    id: "purple-bubbles" as const,
    name: "Purple",
    source: require("../../../../assets/backgrounds/purple-bubbles.webp"),
  },
  {
    id: "cyber" as const,
    name: "Futuristic",
    source: require("../../../../assets/backgrounds/futuristic_texture.png"),
  },
  {
    id: "green" as const,
    name: "GreenFelt",
    source: require("../../../../assets/backgrounds/poker_table_green_surface_texture_full-screen.png"),
  }
] as const;

export type FeltImageId = (typeof FELT_BACKGROUND_IMAGES)[number]["id"];

const FELT_IMAGES: Record<FeltImageId, ImageSourcePropType> = Object.fromEntries(
  FELT_BACKGROUND_IMAGES.map((e) => [e.id, e.source])
) as Record<FeltImageId, ImageSourcePropType>;

/** Presets for the felt image picker (name + imageId). Built from FELT_BACKGROUND_IMAGES. */
export const FELT_IMAGE_PRESETS: ReadonlyArray<{ name: string; imageId: FeltImageId }> =
  FELT_BACKGROUND_IMAGES.map(({ id, name }) => ({ name, imageId: id }));

export function getFeltImageSource(id: string): ImageSourcePropType | null {
  return Object.prototype.hasOwnProperty.call(FELT_IMAGES, id)
    ? (FELT_IMAGES as Record<string, ImageSourcePropType>)[id]
    : null;
}
