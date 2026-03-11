# Table FX System — Top 10 Critiques (Prioritized)

Review of the table animation system with P0–P3 priority. Items marked **Fixed** have been addressed in code/docs.

---

## P0 — Correctness / deadlock (must fix)

### 1. onComplete when TABLE def missing — **Fixed**

If TABLE was undefined but HERO/SEAT ran, completion never fired (blocking bug).

**Fix applied:** `primaryChannel = table?.channel ?? hero?.channel ?? seat?.channel`; completion is driven by that channel’s timeout instead of hard-coding TABLE.

---

## P1 — Integration gaps (not bugs; missing wiring)

### 3. Hero / seat companions never triggered

FX system expects `payload.isHero` and `payload.anchorSeat`. Controller does not supply them. System is fine; integration is incomplete.

**Action:** Wire `isHero` for ALL_IN and SHOWDOWN + `anchorSeat` when adding a SHOWDOWN trigger (see Trigger matrix in TABLE_FX_SUMMARY).

### 4. anchorBounds not passed

Overlay supports HERO/SEAT positioning; host does not supply layout data. Integration gap, not an architecture flaw.

**Action:** When using companions, measure hero zone and seat cells and pass `anchorBounds` from the table page.

### 7. ASSET layer stub

Expected and documented in roadmap. Phase 2 work, not a system flaw.

---

## P2 — Maintainability (worth fixing)

### 2. reducedMotion unused — **Fixed**

**Fix applied:** When `settings.reducedMotion` is true: resolve with `tier = min(tier, 1)`; filter out PARTICLES and STREAK from layers (fallback to full layers if filtered result is empty).

### 8. Sound key validation — **Fixed**

**Fix applied:** In `validateDefinitions`, invalid `cue.sound` (not in SOUND_EVENT_MAP) now throws in __DEV__ instead of warning. Same for `validateCompanionDefinitions`.

### 5. Companion validation — **Fixed**

**Fix applied:** `validateCompanionDefinitions([HERO_AURA_ALL_IN, SEAT_GLOW_SHOWDOWN])` runs at registry load (same layer/duration/sound checks, no event:tier uniqueness for companions).

---

## P3 — Polish / DX

### 6. Layer key=index — **Fixed**

**Fix applied:** Stable key `${layer.type}-${index}` so reordering doesn’t cause wrong reuse.

### 9. Flat procedural layer type

Discriminated unions would add safety but also verbosity. Many FX engines keep a flat type for authoring speed. **Leave as-is** until more layer types justify the refactor.

### 10. Trigger matrix documentation — **Fixed**

**Fix applied:** TABLE_FX_SUMMARY now has a “Trigger matrix” table: event → trigger (current) → payload used → companions and notes.

---

## Additional: Animation starvation — **Fixed**

**Issue:** With rapid requests, “higher tier replaces lower tier” could yield e.g. tier2 → tier3 → tier4 → tier1, so lower-tier events might never display.

**Fix applied:** Minimum display window `MIN_DISPLAY_MS` (300ms). A channel’s animation cannot be replaced until it has been running for at least 300ms. Refs track per-channel start time; replacement is allowed only when elapsed ≥ MIN_DISPLAY_MS (tier rule still applies).

---

## Summary

| Priority | Item | Status |
|----------|------|--------|
| P0 | onComplete from primary channel | Fixed |
| P1 | Hero/seat payload + SHOWDOWN trigger | Integration (caller) |
| P1 | anchorBounds from host | Integration (caller) |
| P1 | ASSET stub | Documented; Phase 2 |
| P2 | reducedMotion | Fixed |
| P2 | Sound key validation | Fixed |
| P2 | Companion validation | Fixed |
| P3 | Stable layer key | Fixed |
| P3 | Flat layer type | Deferred |
| P3 | Trigger matrix doc | Fixed |
| — | Animation starvation (min display) | Fixed |
