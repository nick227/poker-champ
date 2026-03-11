# Table FX — Final Review

Pre-close review of the table animation system: correctness, integration, risks, verification.

---

## 1. Scope (what shipped)

- **Registry:** Event-grouped `animationRegistry/` (potWin, allIn, showdown, shared, index). Tier builders; `TABLE_ANIMATIONS` = `Record<event, Definition[]>`; `resolveAnimation(event, tier)` with tier fallback.
- **Theme:** Per-event palettes (POT_WIN gold/amber, ALL_IN fire, SHOWDOWN cool); `getAnimationTheme(event)` with cache; optional streakColor/haloColor.
- **Layers:** FLASH, BURST, PARTICLES, RING, TEXT (procedural); ASSET (stub). Easing (ease-out in, ease-in out); theme timing (burstScale, ringScale) wired to Burst/Ring; headline scale 0.92→1; glow shadow offset.
- **Overlay:** Request → resolve def → per-channel state; theme per channel; sound cues; lifecycle effect uses captured cleanup fns (lint-clean); onComplete via ref so effect doesn’t depend on callback identity.
- **Code quality:** Theme cache by event; TEXT_SHADOW_OFFSET_NONE; overlay cleanup ref fix.

---

## 2. Correctness

| Area | Status | Notes |
|------|--------|--------|
| **Resolver** | OK | Clamp tier 0–4; exact match else closest lower tier; O(1) via BY_EVENT_TIER. |
| **Collision** | OK | Same channel: higher tier replaces; different channel: concurrent. |
| **Theme** | OK | Unknown event → defaultTheme; POT_WIN/ALL_IN/SHOWDOWN → cached merged theme. |
| **Per-channel theme** | OK | Overlay resolves theme inside map with `req.event`; each channel gets correct palette. |
| **Cleanup** | OK | Effect stores cleanup fns in array; cleanup runs those fns (no ref read in cleanup). |
| **onComplete** | OK | Required callback stored in ref; timeout calls ref; effect deps [activeByChannel, settings.enabled]. |
| **Validation** | OK | Runs at registry load; unique (event,tier), non-empty layers, durationMs>0, TEXT role, ASSET source. |

---

## 3. Integration points

| Consumer | Uses | Status |
|----------|------|--------|
| **TablePageOverlays** | TableAnimationOverlay, request, onComplete | No API change. |
| **useTablePageController** | TableAnimationRequest type, mapPotWinTier, mapAllInTier, TABLE_ANIMATION_REQUEST_VERSION | Types and mapper unchanged. |
| **tableSceneContract** | TableAnimationRequest type | Unchanged. |
| **renderAnimationLayer** | animationRegistry (DEFAULT_LAYER_PARAMS), theme | Registry import resolves to animationRegistry/index; theme from overlay. |

**Public surface:** `animations/index.ts` exports overlay, resolveAnimation, TABLE_ANIMATIONS (now Record), mapper, types, constants, renderAnimationLayer, getPreloadSources, buildDefinitionId. No consumer iterates TABLE_ANIMATIONS as an array; overlay uses resolveAnimation only. Safe.

---

## 4. Risks and assumptions

- **request identity:** Overlay effect depends on `request` in the first effect (setState). If request is a new object every render with same event/tier, we still only update when def or channel collision says so. OK.
- **Layers unmount on completion:** We assume each animation run mounts overlay content once and unmounts when the timeout fires. No long-lived layer instances with changing props (e.g. particleCount). Documented in code quality review.
- **THEME_CACHE:** Never cleared; keys are the three events. No memory leak; palette/timing are static at runtime.
- **reducedMotion:** Not implemented; settings.reducedMotion is accepted but not yet used. Backlog.

---

## 5. Verification

| Check | Result |
|-------|--------|
| Typecheck (client) | Pass |
| Client unit tests | 232 passed |
| Money safety tests | 11 passed |
| Lint (animations/) | Pass (overlay ref cleanup applied) |

---

## 6. Docs

- **TABLE_FX_SUMMARY.md** — Inventory, layout, theme, backlog, related docs. Matches implementation.
- **TABLE_FX_ROADMAP.md** — Spec, registry structure, maintainability. Matches.
- **TABLE_FX_STAGING_CHECKLIST.md** — Pre-push verification and smoke test.
- Proposals (PRO_DESIGN, DESIGN_PASS, CODE_QUALITY_REVIEW) and task list reference implementation; no contradictions.

---

## 7. Sign-off

- **Logic:** Resolver, collision, theme resolution, overlay lifecycle, and cleanup behavior are correct and consistent with the spec.
- **Integration:** No breaking changes to table-page or contract; TABLE_ANIMATIONS type change is internal to registry/overlay usage.
- **Performance:** Theme cache and overlay effect deps reduce unnecessary work; useNativeDriver used throughout.
- **Ready for:** Commit, then staging deploy and manual smoke (POT_WIN / ALL_IN / SHOWDOWN palettes, completion, sound). Push when instructed.
