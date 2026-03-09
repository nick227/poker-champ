import type {
  BackgroundConsumer,
  BackgroundImageId,
  FeltGradient,
  ResolvedBackground,
  SurfaceBackground,
} from "./background.types";

/** Default app background when surface is "none". Matches --c-bg token. */
const DEFAULT_APP_BG = "0 0% 5%";

function resolveImageSize(_consumer: BackgroundConsumer): "cover" | "stretch" {
  return "cover";
}

/**
 * Resolves surface background to normalized metadata. Image backgrounds render as cover.
 *
 * Priority (deterministic if theme sets more than one): image > gradient > color.
 *
 * Gradient handling:
 * - Web: resolved as gradient (CSS in background.web adapter).
 * - Native: resolved as gradient here; the native adapter (background.native) turns it into
 *   gradient.primaryColor (first color) because ViewStyle has no gradient support. So gradients
 *   do not render on native in v1—only the first stop is used.
 */
export function resolveBackground(
  surface: SurfaceBackground,
  consumer: BackgroundConsumer
): ResolvedBackground {
  if (surface.imageId != null) {
    return {
      kind: "image",
      color: surface.color,
      imageId: surface.imageId as BackgroundImageId,
      size: resolveImageSize(consumer),
    };
  }
  if (surface.gradient != null && surface.gradient.colors.length >= 2) {
    return {
      kind: "gradient",
      color: surface.color,
      gradient: surface.gradient as FeltGradient,
    };
  }
  if (surface.color != null) {
    return { kind: "color", color: surface.color };
  }
  return { kind: "none", color: consumer === "app" ? DEFAULT_APP_BG : null };
}
