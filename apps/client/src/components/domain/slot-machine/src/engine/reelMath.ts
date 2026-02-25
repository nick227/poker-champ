/**
 * MVP Rule: Single helper for modulo normalization to prevent reel position desync
 */

export function normalizeReelPosition(position: number, reelLength: number): number {
  // Ensure positive modulo to prevent negative positions
  return ((position % reelLength) + reelLength) % reelLength;
}

export function normalizeReelPositions(
  positions: readonly [number, number, number],
  reelLengths: readonly [number, number, number]
): [number, number, number] {
  return [
    normalizeReelPosition(positions[0], reelLengths[0]),
    normalizeReelPosition(positions[1], reelLengths[1]),
    normalizeReelPosition(positions[2], reelLengths[2]),
  ];
}
