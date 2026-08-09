/**
 * Pure decision logic for table FX triggers driven by snapshot state.
 *
 * Kept separate from useTablePageController's effects so the "should this fire, and
 * with what payload" logic is unit-testable without rendering the full controller hook
 * (which pulls in stores, realtime connections, router, etc.).
 */
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { mapShowdownTier } from "./animationMapper";
import { resolveAnimation } from "./animationRegistry";
import { TABLE_ANIMATION_REQUEST_VERSION } from "./animationTypes";
import type { TableAnimationRequest } from "./animationTypes";

export type ShowdownAnimationDecision = {
  handId: string;
  request: TableAnimationRequest;
};

/**
 * Decide whether a SHOWDOWN fx request should fire for the current snapshot.
 *
 * Hero-only, mirroring POT_WIN's isHeroWinner-style gating: SHOWDOWN only fires when hero
 * actually reached showdown (didn't fold before the reveal) — never for a background
 * showdown between two bots/opponents. Unlike POT_WIN, it fires whether hero wins or loses
 * the hand, since the "showdown" moment is the card reveal itself, not a win celebration.
 *
 * Returns null when there's nothing new to fire: no showdown this hand, hero folded before
 * it, or an fx request was already dispatched for this handId (pass the last-fired handId
 * to dedupe, mirroring the lastPotWinHandIdRef pattern).
 */
export function resolveShowdownAnimationDecision(
  snapshot: TableSnapshotPayload | undefined,
  lastFiredHandId: string | null
): ShowdownAnimationDecision | null {
  const result = snapshot?.lastHandResult;
  if (!result || result.reason !== "SHOWDOWN") return null;

  const heroId = snapshot?.hero?.userId;
  if (!heroId) return null;

  const heroReachedShowdown = result.showdownHoleCardsByUserId?.[heroId] != null;
  if (!heroReachedShowdown) return null;

  if (lastFiredHandId === result.handId) return null;

  const potCents = result.potCents ?? 0;
  const isHeroWinner = (result.payoutsByUserId?.[heroId] ?? 0) > 0;
  const tier = mapShowdownTier({
    potCents,
    isHeroWinner,
    winningHandDescr: result.winningHandDescr,
  });

  return {
    handId: result.handId,
    request: {
      version: TABLE_ANIMATION_REQUEST_VERSION,
      event: "SHOWDOWN",
      tier,
      payload: {
        headline: "SHOWDOWN",
        potCents,
        isHero: true,
        anchorSeat: snapshot?.hero?.seat,
      },
    },
  };
}

/** Fallback SHOWDOWN duration (ms) if registry lookup ever misses; kept in the recommended 150-4000ms band. */
const SHOWDOWN_DURATION_FALLBACK_MS = 1500;

/** Small buffer after the SHOWDOWN fx's own cleanup timeout so POT_WIN never races it for the shared TABLE channel. */
const POT_WIN_AFTER_SHOWDOWN_BUFFER_MS = 80;

/**
 * How long (ms) to delay dispatching the POT_WIN request after a hand that reached SHOWDOWN.
 *
 * SHOWDOWN and POT_WIN both render on the TABLE fx channel (one animation at a time) and can
 * both become eligible in the same render pass (both keyed off snapshot.lastHandResult). Firing
 * POT_WIN immediately would either overwrite the SHOWDOWN request in React state before it's
 * ever rendered, or (if it survives) race TableAnimationOverlay's tier-gated channel-replace
 * logic. Delaying POT_WIN until after SHOWDOWN's own definition has fully finished and cleared
 * the channel guarantees clean sequential choreography: reveal, then pot moves to winner.
 *
 * Returns 0 when the hand ended by fold (LAST_PLAYER) — no showdown reveal to sequence after.
 */
export function computePotWinDispatchDelayMs(
  reason: "LAST_PLAYER" | "SHOWDOWN" | undefined,
  potCents: number,
  winningHandDescr: string | undefined
): number {
  if (reason !== "SHOWDOWN") return 0;
  // Hero is always the winner in this branch (POT_WIN only fires for isHeroWinner), so the
  // winning hand is hero's own hand — same tier math the SHOWDOWN trigger would use for a win.
  const tier = mapShowdownTier({ potCents, isHeroWinner: true, winningHandDescr });
  const durationMs = resolveAnimation("SHOWDOWN", tier)?.durationMs ?? SHOWDOWN_DURATION_FALLBACK_MS;
  return durationMs + POT_WIN_AFTER_SHOWDOWN_BUFFER_MS;
}

/**
 * Schedule `dispatch` after `delayMs`, tracking it in `pendingTimeouts` so it survives unrelated
 * re-renders/effect-dep changes — call `clearAllPendingTimeouts` only on true component unmount.
 *
 * Why this exists: a naive `useEffect(() => { const id = setTimeout(dispatch, delayMs); return
 * () => clearTimeout(id); }, [deps])` looks correct but is not, for a *delayed, already-deduped*
 * dispatch. If `deps` change again (e.g. the next hand's snapshot arrives) before `delayMs`
 * elapses, React runs that cleanup and silently cancels the pending dispatch — permanently
 * losing it, since the effect's own dedup guard (checked before scheduling) prevents it from
 * ever being rescheduled. Tracking the timeout in a ref that outlives any single effect run,
 * and only clearing on unmount, avoids this: once a dispatch is scheduled it always fires.
 */
export function scheduleSurvivingTimeout(
  pendingTimeouts: Set<ReturnType<typeof setTimeout>>,
  delayMs: number,
  dispatch: () => void
): void {
  const timeoutId = setTimeout(() => {
    pendingTimeouts.delete(timeoutId);
    dispatch();
  }, delayMs);
  pendingTimeouts.add(timeoutId);
}

/** Cancel and forget all timeouts scheduled via {@link scheduleSurvivingTimeout}. Unmount-only. */
export function clearAllPendingTimeouts(pendingTimeouts: Set<ReturnType<typeof setTimeout>>): void {
  pendingTimeouts.forEach((id) => clearTimeout(id));
  pendingTimeouts.clear();
}
