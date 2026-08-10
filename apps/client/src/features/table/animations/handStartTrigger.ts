/**
 * Pure decision logic for HAND_START fx — mirrors the handId transition used for deal sound.
 */
import { TABLE_ANIMATION_REQUEST_VERSION } from "./animationTypes";
import type { TableAnimationRequest } from "./animationTypes";

export type HandStartAnimationDecision = {
  handId: string;
  request: TableAnimationRequest;
};

/**
 * Fire when handId becomes a new non-null value after the observer has been seeded.
 *
 * `lastObservedHandId === undefined` means "not seeded yet" — caller should seed without firing.
 * After seed, a transition into a different non-null handId returns a request.
 */
export function resolveHandStartAnimationDecision(
  handId: string | null | undefined,
  lastObservedHandId: string | null | undefined,
): HandStartAnimationDecision | null {
  if (lastObservedHandId === undefined) return null;
  if (handId == null || handId === "") return null;
  if (handId === lastObservedHandId) return null;
  return {
    handId,
    request: {
      version: TABLE_ANIMATION_REQUEST_VERSION,
      event: "HAND_START",
      tier: 0,
    },
  };
}
