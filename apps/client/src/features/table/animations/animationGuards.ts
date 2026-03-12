/**
 * Guards for table animation requests. Enforce rules so animations only run for intended cases.
 */
import type { TableAnimationRequest } from "./animationTypes";

/**
 * Win animation (POT_WIN) is hero-only: we never run it for opponent wins.
 * Returns false when request is POT_WIN and payload does not indicate hero won.
 */
export function shouldRunTableAnimationRequest(request: TableAnimationRequest): boolean {
  if (request.event !== "POT_WIN") return true;
  return request.payload?.isHero === true;
}
