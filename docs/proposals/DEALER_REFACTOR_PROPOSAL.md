# Dealer.ts High-Value Refactors Proposal

Top refactors for `src/engine/Dealer.ts` (728 lines), with nuance from code review and additional quick wins. **Note:** The "Additional refactors" section is labeled that way because those items have lower architectural complexity (smaller scope), not because they are lower urgency — when triaging by risk, timer cleanup and fire-and-forget asymmetry may be more urgent than refactors 3 or 4.

---

## 1. Extract hand-scoped state into a `HandContext` (or `CurrentHandState`)

**Problem:** Hand-scoped and action-scoped data is spread across many Dealer fields: `holeCardsByPlayerId`, `handStartingStacksByPlayerId`, `preflopFlagsByUserId`, `lastHandResult`, `lastAction`, `processedActionKeys`, `actionIdFirstClaimByKey`, `warnedCrossUserCollisionKeys`, `lastProcessedHandId`. Clearing/reset happens in multiple places (`handleAction` hand-id check, `flushSessionStatsThenTransitionToWaiting`, `initPreflopFlagsForHand`), which is error-prone and hard to reason about. **Evidence:** `holeCardsByPlayerId` is passed into four different services in the constructor; clearing is scattered. The bug surface is real.

**Nuance:** `preflopFlagsByUserId` is also passed around implicitly via callbacks (`initPreflopFlagsForHand`, `flushSessionStatsOnly`). A HandContext would own and clear all of that in one place.

**Refactor:**

- Create `HandContext` (e.g. in `dealer/HandContext.ts`) owning: `holeCardsByPlayerId`, `handStartingStacksByPlayerId`, `preflopFlagsByUserId`, `processedActionKeys`, `actionIdFirstClaimByKey`, `warnedCrossUserCollisionKeys`, and **`lastAction`**. `lastAction` is clearly hand-scoped (reset when a new hand starts; used in snapshots during the hand).
- **`lastHandResult`** is different: it is displayed *after* the hand ends, during the WAITING period before the next hand. If `currentHand` is set to null on transition to WAITING, `lastHandResult` would be lost. So **`lastHandResult` stays at Dealer level**: a Dealer-level field that is set from HandContext (or from hand-lifecycle code) *before* `currentHand` is cleared. When transitioning to WAITING: flush stats, set `this.lastHandResult = currentHand.lastHandResult` (or equivalent from wherever the result is produced), then set `this.currentHand = null`. Resolving this now avoids a bug during implementation.
- Dealer holds `private currentHand: HandContext | null`. At HAND_START set `this.currentHand = new HandContext(...)`; when transitioning to WAITING (after flushing stats and copying lastHandResult out), set `this.currentHand = null`.
- Services receive hand-scoped data from `currentHand` (or getters). SnapshotService gets `lastAction` from `currentHand` when non-null and `lastHandResult` from the Dealer-level field. Action dedup in `handleAction` uses `currentHand` for the dedup sets, so when HandContext is introduced first, **ActionGateway (refactor 2) can take `currentHandId` and a reference to the current HandContext for dedup** — no need for the gateway to own those maps.

**Value:** Highest correctness value. Clear hand boundary; one place to create and clear; fewer bugs from forgotten resets; preflop and dedup logic live in one hand-scoped object. Doing this first keeps ActionGateway’s boundary clean (dedup state stays in HandContext).

---

## 2. Extract action queue and deduplication into an `ActionGateway`

**Problem:** `handleAction` (lines 261–315) mixes queue depth, chaining, hand-id reset, action/claim keys, collision warning, dedup early-exit, and the call to `_handleAction`. Too much responsibility; dedup/queue behavior is hard to unit test.

**Scope:** The dedup sets (`processedActionKeys`, `actionIdFirstClaimByKey`, `warnedCrossUserCollisionKeys`) are hand-scoped and belong in **HandContext** (refactor 1). Do HandContext first so the gateway doesn’t own those maps and then have to move them later. The gateway should be **stateless with respect to hand identity**: it receives `currentHandId` (and access to the current hand’s dedup state) on each `enqueue` call rather than being notified “hand changed.” Passing `currentHandId` per call is the cleaner design.

**Refactor:**

- Introduce `ActionGateway` (e.g. `dealer/ActionGateway.ts`) that owns only: `actionQueue`, `pendingActionCount`, `maxQueueDepth`.
- **Dedup interface:** The gateway does *not* accept a generic callback (that would leave ownership ambiguous). Instead it receives the current `HandContext` (or null) and calls explicit methods: e.g. `handContext.isDuplicate(actionKey)` to decide whether to skip, and `handContext.recordProcessed(actionKey)` after successful work when the hand didn’t change. HandContext owns the dedup state; the gateway only invokes these methods. Same for claim-key / collision warning if that stays in HandContext: e.g. `handContext.recordClaimAndWarnIfCollision(claimKey, userId)`.
- **Nullable handContext:** `handContext` is nullable — `currentHandId` may be null when no hand is active. The gateway must handle `handContext === null` gracefully: in that case **dedup is skipped entirely** (no hand to scope it to). No duplicate check, no recordProcessed; just run the work. State this explicitly so the implementation doesn’t need to guess.
- API: `enqueue(userId, msg, actionId, currentHandId, handContext, work): Promise<void>` — checks depth, chains, resets when hand changes (new hand ⇒ new HandContext), runs work, then calls `handContext.recordProcessed(actionKey)` when hand unchanged (and handContext non-null).
- Dealer’s `handleAction`: pass `this.currentHand` and `this.state.handId` into the gateway; gateway calls `handContext.isDuplicate(...)` / `handContext.recordProcessed(...)` when handContext is non-null.

**Value:** Single place for queue and depth; clear ownership (HandContext owns dedup; gateway only calls in); easy to test gateway with a mock HandContext.

---

## 3. Shared helper for overlapping plan steps (instead of one giant switch)

**Problem:** `executeHandLifecyclePlans` and `executePlayerLifecyclePlans` duplicate handling for `EMIT_SNAPSHOT`, `MAYBE_AUTOMATE_TURN`, `RELEASE_PENDING_SEATS`. Adding a new shared step means touching both.

**Nuance:** The overlap is only ~3 cases; hand-only and player-only kinds are distinct. A single giant switch could trade duplication for a harder-to-navigate function.

**Refactor (middle ground):** Add a **shared** `executeCommonPlan(plan)` (or similar) that handles only the overlapping kinds:

- For `EMIT_SNAPSHOT`: optional HAND_END stats flush + `sendTableSnapshotToAll(plan.reason, plan.actionId)`.
- For `MAYBE_AUTOMATE_TURN`: `maybeActForBot()`.
- For `RELEASE_PENDING_SEATS`: `releasePendingSeats()`.

Both `executeHandLifecyclePlans` and `executePlayerLifecyclePlans` call this helper when `plan.kind` is one of these three; otherwise they handle their own kinds (DELAY, TRANSITION_TO_WAITING, SCHEDULE_NEXT_HAND vs START_HAND, ENSURE_HAND_ADVANCING_AFTER_PLAYER_REMOVAL, etc.). No full merge into one switch — just DRY the three shared cases.

**Value:** Removes duplication for the shared steps without a single large switch; executors stay readable.

---

## 4. Thin constructor via factory or `DealerContext` — defer

**Problem:** Constructor is long and wires many services and callbacks.

**Nuance:** The wiring is comprehensible — verbose, not confusing. The real payoff comes **after HandContext**, since that removes several of the shared mutable maps passed around. Doing constructor thinning earlier is churn for modest gain.

**Refactor:** Same as originally proposed (factory or `DealerContext`), but do it **after** HandContext so the “shared state” that context holds is stable. Weakest priority.

---

## Suggested order

1. **HandContext** (1) — Highest correctness value; dedup sets live here, so ActionGateway doesn’t need to own them.
2. **ActionGateway** (2) — Takes `currentHandId` and dedup from HandContext; clean boundary from the start.
3. **Shared executeCommonPlan** (3) — Low risk, reduces duplication.
4. **Thin constructor** (4) — Defer until after HandContext; do when the rest of the wiring has settled.

---

## Additional refactors (smaller scope; some are high urgency — see intro)

### scheduleNextHand — timer fragility and leak

**Problem:** Double-setTimeout (result-hold delay, then countdown); `nextHandScheduled` guard prevents double-scheduling but there is no cleanup. If the room disposes between the two timers, the inner one still fires. Timer IDs are never stored, so there is no `stopDisconnectSweep`-style cancel on dispose. Latent leak.

**Refactor:** Extract a small **HandScheduler** (or equivalent) that owns the two delays and exposes `scheduleNextHand(...)` and `cancel()`. Store both timer IDs so Dealer (or room) can call `cancel()` on dispose. Alternatively, at minimum store the timer IDs on Dealer and clear them in a dispose/teardown path.

---

### _handleAction — preflop flag tracking

**Problem:** `_handleAction` does three things: execute action, update lastAction, and conditionally update preflop flags. The preflop update requires `roundBetBefore` to be snapshotted before execution — a subtle ordering dependency that isn’t obvious. Preflop logic doesn’t belong in the core execute-then-advance pipeline.

**Refactor:** With HandContext in place, move flag update into HandContext, e.g. `handContext.recordActionForPreflopStats(userId, lastAction, roundBetBefore)`. Then `_handleAction` becomes: capture `roundBetBefore` at the top (unchanged) → execute → setLastActionFromExecution → recordActionForPreflopStats (if preflop) → applyActionResult. The refactor moves *where* the flag update lives, not *when* `roundBetBefore` is read — the snapshot of `roundBetBefore` stays at the top of `_handleAction`. The ordering dependency doesn’t go away; it just becomes less surprising because it’s explicit in the args passed to `recordActionForPreflopStats`.

---

### sweepDisconnectDeadlines — reconnect check

**Problem:** When a player is past their deadline, the sweep checks `this.clientsByUserId.has(userId)` and if true calls `markReconnected`. That suggests a connected player can still have a past deadline — which is a defensive patch for a gap elsewhere (reconnect path should clear deadline). Readers get a “why would a connected player have a past deadline?” moment. Documenting a workaround tends to calcify it.

**Refactor:** **Fix the reconnect path** so the sweep only needs to handle the abandon case. The reconnect path should clear `disconnectDeadlineTs` to zero when the client reconnects, so the sweep condition (`disconnectDeadlineTs > 0 && now > disconnectDeadlineTs`) never fires for an active client. Then the sweep can drop the “if connected, call markReconnected” branch and only abandon players who are still past deadline. If “document or fix” is kept for any reason, at minimum state in the doc that the deadline must be cleared to zero on reconnect so the sweep never treats an active client as past deadline.

---

### buildHandHistoryRoster (and ensurePlayerPersistence)

**Problem:** `buildHandHistoryRoster` is a private Dealer method that maps internal state to a persistence DTO; it is called from `ensurePlayerPersistence`, which is itself a Dealer method that arguably belongs closer to the persistence/player lifecycle layer. Projection belongs closer to the consumer of that shape.

**Refactor:** Move roster building to HandLifecycleService or PersistenceFacade (or a small mapper used by them). **`ensurePlayerPersistence`** can move with it — e.g. into PlayerLifecycleService or a persistence helper — so the two relocate together. Dealer shouldn’t own the roster shape; next time a different persistence call needs a different roster shape, it won’t grow in Dealer.

---

### runPlayerLifecyclePlansFireAndForget — asymmetry and risk

**Problem:** `markDisconnected` and `markReconnected` use fire-and-forget plan execution; most other lifecycle methods await their plans. The asymmetry isn’t documented. Snapshot emissions from these paths can race with subsequent serialized mutations. Easy to introduce bugs when adding new plan steps.

**Refactor:** The two **serialized variants already exist** (`markDisconnectedSerialized`, `markReconnectedSerialized`) but are apparently not used everywhere they could be. Part of the fix is auditing call sites. For each call site, the key question: **"Is this called from a synchronous Colyseus event handler where await is impossible?"** If yes → use `enqueueSerializedStateMutation`. If no (caller is already async) → there’s no reason it wasn’t awaited in the first place; it should become a direct `await`. The audit should distinguish these two cases rather than routing everything through `enqueueSerializedStateMutation` by default, since unnecessary queueing adds latency to snapshot emissions. At minimum add a comment explaining why any remaining fire-and-forget is necessary. **Timer cleanup (scheduleNextHand) and this fire-and-forget asymmetry are the most immediately risky** and worth addressing early.
