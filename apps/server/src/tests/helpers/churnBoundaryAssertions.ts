import { expect } from "vitest";
import type { PokerState } from "../../state/PokerState.js";
import { isSameHandActive } from "../../engine/invariants/churnInvariantContract.js";

type DeferredOrRemovedInput = {
  state: PokerState;
  userId: string;
  handIdBefore: string | null | undefined;
};

export function expectDeferredOrRemoved(input: DeferredOrRemovedInput): void {
  const { state, userId, handIdBefore } = input;
  const player = state.playersById.get(userId);
  if (isSameHandActive(state, handIdBefore)) {
    expect(player).toBeTruthy();
    expect(player?.pendingLeave).toBe(true);
    expect(player?.status).toBe("ABANDONED");
    expect(player?.needsAction).toBe(false);
    return;
  }
  expect(player).toBeUndefined();
}
