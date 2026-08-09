/** Poker-table aspect (width / height) for the desktop felt stage. */
const STAGE_ASPECT = 1.75;
const STAGE_MAX_WIDTH = 1120;
/** Leave room for nav rail, dock, and gutters when sizing from viewport width. */
const WIDTH_VIEWPORT_FRACTION = 0.58;
/** Cap stage height so hero + action bar stay on screen. */
const HEIGHT_VIEWPORT_FRACTION = 0.48;
const STAGE_MIN_HEIGHT = 280;

export type DesktopStageSize = {
  width: number;
  height: number;
};

/** Size the felt oval from the viewport — never stretch it to fill leftover flex space. */
export function desktopStageSize(viewportWidth: number, viewportHeight: number): DesktopStageSize {
  const maxWidth = Math.min(STAGE_MAX_WIDTH, Math.round(viewportWidth * WIDTH_VIEWPORT_FRACTION));
  const maxHeight = Math.max(
    STAGE_MIN_HEIGHT,
    Math.round(viewportHeight * HEIGHT_VIEWPORT_FRACTION),
  );
  let height = Math.min(maxHeight, Math.round(maxWidth / STAGE_ASPECT));
  let width = Math.min(maxWidth, Math.round(height * STAGE_ASPECT));
  if (width < maxWidth && height < maxHeight) {
    // Prefer using available width when height still has headroom.
    width = maxWidth;
    height = Math.min(maxHeight, Math.round(width / STAGE_ASPECT));
  }
  return { width, height };
}
