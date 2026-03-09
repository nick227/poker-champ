export type {
  BackgroundConsumer,
  BackgroundImageId,
  FeltGradient,
  ResolvedBackground,
  SurfaceBackground,
} from "./background.types";
export {
  deriveLegacyFromSurface,
  nextAppBackgroundCleared,
  nextAppBackgroundColor,
  nextAppBackgroundGradient,
  nextAppBackgroundImageId,
  nextFeltBackgroundCleared,
  nextFeltBackgroundColor,
  nextFeltBackgroundGradient,
  nextFeltBackgroundImageId,
} from "./background.helpers";
export { resolveBackground } from "./background.resolver";
export {
  APP_PAGE_SELECTOR,
  applyAppPageBackgroundStyle,
  resolvedToBodyStyle,
  type GetBackgroundImageUrl,
} from "./background.web";
