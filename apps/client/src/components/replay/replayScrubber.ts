/**
 * Pure helper for frame scrubber: map tap position to step index.
 * Exported for tests.
 */
export function getStepFromTrackPress(
  locationX: number,
  trackWidth: number,
  totalSteps: number,
): number {
  if (totalSteps <= 1 || trackWidth <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, locationX / trackWidth));
  return Math.round(ratio * (totalSteps - 1));
}
