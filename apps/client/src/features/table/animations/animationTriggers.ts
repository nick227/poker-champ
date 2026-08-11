/**
 * Pure decision logic for table FX triggers driven by snapshot state.
 *
 * Kept separate from useTablePageController's effects so the "should this fire, and
 * with what payload" logic is unit-testable without rendering the full controller hook
 * (which pulls in stores, realtime connections, router, etc.).
 */
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { mapAllInTier, mapPotWinTier, mapShowdownTier } from "./animationMapper";
import { resolveAnimation } from "./animationRegistry";
import { TABLE_ANIMATION_REQUEST_VERSION } from "./animationTypes";
import type { TableAnimationRequest } from "./animationTypes";
import type { HandResultMessage } from "../components/table/table.types";

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

  // SEAT_GLOW_SHOWDOWN (the seat-area glow companion) reads anchorSeat to know which pod to
  // light up — it's meant to highlight the hand's actual winner, not just whoever reached the
  // reveal. Resolve winnerId to a seat via the snapshot's seat list; fall back to hero's own
  // seat only when winnerId is unavailable (e.g. an unresolved split pot).
  const winnerSeat =
    snapshot?.seats?.find((s) => s.userId === result.winnerId)?.seat ?? snapshot?.hero?.seat;

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
        anchorSeat: winnerSeat,
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

export type PotWinAnimationDecision = {
  handId: string;
  /** Delay (ms) the caller should wait before dispatching, via scheduleSurvivingTimeout. 0 = dispatch now. */
  delayMs: number;
  request: TableAnimationRequest;
};

/**
 * Decide whether a POT_WIN fx request should fire for the current snapshot.
 *
 * Hero-only, like SHOWDOWN and ALL_IN below: the canonical POT_WIN definition speaks in hero's
 * voice ("YOU WIN $X"), so it never fires for a background win between two opponents. Delay
 * math is delegated to computePotWinDispatchDelayMs so POT_WIN sequences after a SHOWDOWN reveal
 * on the shared TABLE fx channel instead of racing it (both key off the same lastHandResult).
 */
export function resolvePotWinAnimationDecision(
  winnerBanner: HandResultMessage | null,
  lastHandResult: TableSnapshotPayload["lastHandResult"],
  isHeroWinner: boolean,
  heroSeat: number | undefined,
  lastFiredHandId: string | null,
): PotWinAnimationDecision | null {
  if (!winnerBanner || !lastHandResult || !isHeroWinner) return null;
  const handId = lastHandResult.handId;
  if (lastFiredHandId === handId) return null;

  const potCents = lastHandResult.potCents ?? 0;
  const tier = mapPotWinTier({ potCents, winningHandDescr: winnerBanner.winningHandDescr });
  const delayMs = computePotWinDispatchDelayMs(lastHandResult.reason, potCents, winnerBanner.winningHandDescr);

  return {
    handId,
    delayMs,
    request: {
      version: TABLE_ANIMATION_REQUEST_VERSION,
      event: "POT_WIN",
      tier,
      payload: {
        headline: "YOU WIN",
        amountCents: winnerBanner.amountCents,
        potCents,
        isHero: true,
        winnerSeat: heroSeat,
      },
    },
  };
}

export type AllInAnimationDecision = {
  /** `${handId}:${seq}` dedupe key — an all-in action, not a whole hand, so handId alone can repeat. */
  key: string;
  request: TableAnimationRequest;
};

/**
 * Decide whether an ALL_IN fx request should fire for the current snapshot's lastAction.
 *
 * Hero-only (mirrors POT_WIN/SHOWDOWN's "fx speaks from hero's seat" convention) — an opponent
 * shoving doesn't get the flashy hero-perspective treatment. Dedupe key is per-action
 * (handId:seq), not per-hand, since a hero could in principle be all-in more than once across
 * a hand's runouts in rare edge cases (e.g. rebuy tables) — matching the original inline logic.
 */
export function resolveAllInAnimationDecision(
  lastAction: TableSnapshotPayload["lastAction"],
  heroUserId: string | undefined,
  heroSeat: number | undefined,
  potCents: number,
  lastFiredKey: string | null,
): AllInAnimationDecision | null {
  if (lastAction?.action !== "ALL_IN") return null;
  if (!heroUserId || lastAction.actorUserId !== heroUserId) return null;

  const key = `${lastAction.handId}:${lastAction.seq}`;
  if (lastFiredKey === key) return null;

  const tier = mapAllInTier({ potCents, amountCents: lastAction.amountCents });

  return {
    key,
    request: {
      version: TABLE_ANIMATION_REQUEST_VERSION,
      event: "ALL_IN",
      tier,
      payload: {
        headline: "ALL IN",
        amountCents: lastAction.amountCents,
        potCents,
        isHero: true,
        anchorSeat: heroSeat,
      },
    },
  };
}

export type WinnerRevealAnimationDecision = {
  handId: string;
  /** Delay (ms) the caller should wait before dispatching, via scheduleSurvivingTimeout. 0 = dispatch now. */
  delayMs: number;
  request: TableAnimationRequest;
};

/**
 * Decide whether a WINNER_REVEAL fx request ("this seat just won the pot" pulse, SEAT channel
 * only — see seatGlow.ts's SEAT_GLOW_WINNER_REVEAL) should fire for the current snapshot.
 *
 * Fires for every hand with a winner EXCEPT one case: when hero reached an actual SHOWDOWN and
 * lost it (or, in a multi-way pot, didn't win it). SHOWDOWN already dispatches its own seat-glow
 * companion (SEAT_GLOW_SHOWDOWN, seatGlow.ts) anchored at the same winner's seat, undelayed — and
 * both companions render on the same SEAT channel, which only ever holds one animation at a time.
 * Without this exclusion, WINNER_REVEAL's own dispatch (also undelayed in this case — see below)
 * would almost always lose the race for that channel to SEAT_GLOW_SHOWDOWN, which claims it first
 * and blocks replacement for MIN_DISPLAY_MS — so the pulse would silently never render for any
 * hand that reached showdown at all. Returning null here instead just lets SHOWDOWN's own
 * companion be the one seat-glow the player sees, which already fully covers "the winner's seat
 * glows" for that hand.
 *
 * Delayed only when hero won at showdown: SHOWDOWN's own TABLE-channel dispatch is also keyed off
 * this same lastHandResult change, and setAnimationRequest is a single state slot, so an
 * undelayed dispatch here could land in the same render commit and silently overwrite (or be
 * overwritten by) SHOWDOWN's request before TableAnimationOverlay ever sees it. Reuses
 * computePotWinDispatchDelayMs — the exact math POT_WIN already uses to sequence after SHOWDOWN's
 * reveal — so the pulse lands right after it finishes (by which point SEAT_GLOW_SHOWDOWN's own,
 * much shorter, companion has already self-cleared the SEAT channel — no collision here). Every
 * other case (any fold-out win) has nothing to sequence after, so delayMs is 0 — but the caller
 * still schedules it via scheduleSurvivingTimeout rather than dispatching synchronously, for the
 * same same-tick-collision reason (see the effect in useTablePageController.tsx).
 */
export function resolveWinnerRevealAnimationDecision(
  snapshot: TableSnapshotPayload | undefined,
  winnerBanner: HandResultMessage | null,
  isHeroWinner: boolean,
  lastFiredHandId: string | null,
): WinnerRevealAnimationDecision | null {
  const result = snapshot?.lastHandResult;
  if (!winnerBanner || !result) return null;
  if (lastFiredHandId === result.handId) return null;

  const shouldDelay = isHeroWinner && result.reason === "SHOWDOWN";

  const heroId = snapshot?.hero?.userId;
  const heroReachedShowdown = heroId != null && result.showdownHoleCardsByUserId?.[heroId] != null;
  if (result.reason === "SHOWDOWN" && !shouldDelay && heroReachedShowdown) return null;

  const delayMs = shouldDelay
    ? computePotWinDispatchDelayMs(result.reason, result.potCents ?? 0, winnerBanner.winningHandDescr)
    : 0;

  // Same winnerId -> seat resolution as resolveShowdownAnimationDecision above.
  const winnerSeat =
    snapshot?.seats?.find((s) => s.userId === result.winnerId)?.seat ?? snapshot?.hero?.seat;

  return {
    handId: result.handId,
    delayMs,
    request: {
      version: TABLE_ANIMATION_REQUEST_VERSION,
      event: "WINNER_REVEAL",
      tier: 0,
      payload: {
        anchorSeat: winnerSeat,
      },
    },
  };
}
