import type { FeltImageId } from "@/components/domain/table/feltImages";

/** When set, surface uses gradient; otherwise solid color or image. */
export type FeltGradient = {
  kind?: "linear" | "radial";
  colors: string[];
  angleDeg?: number;
};

/** v1: same as felt images. Enables future body-specific image set. */
export type BackgroundImageId = FeltImageId;

export type SurfaceBackground = {
  color: string | null;
  imageId: BackgroundImageId | null;
  gradient: FeltGradient | null;
};

export type BackgroundConsumer = "app" | "felt";

export type ResolvedBackground =
  | { kind: "none"; color: string | null }
  | { kind: "color"; color: string }
  | { kind: "gradient"; color: string | null; gradient: FeltGradient }
  | {
      kind: "image";
      color: string | null;
      imageId: BackgroundImageId;
      size: "cover" | "stretch";
    };
