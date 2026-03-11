# Table FX — Staging / Test Readiness Checklist

Use this before closing the branch and pushing to staging.

---

## Verification (run before push)

| Step | Command | Expected |
|------|---------|----------|
| Typecheck | `pnpm -C apps/client typecheck` | Exit 0 |
| Lint | `pnpm -C apps/client lint` | Exit 0 |
| Client unit tests | `pnpm test:client` | All tests pass |
| Money safety | `pnpm test:client:money-safety` | All tests pass |

**Full preflight (optional):** `pnpm preflight:client` — runs contract build, typecheck, lint, test:client, test:client:money-safety.

---

## Staging scope (this push)

### FX system
- **Registry:** Event-grouped registry (`animationRegistry/`: potWin, allIn, showdown, shared, index); tier builders; `TABLE_ANIMATIONS` keyed by event.
- **Theme:** Per-event palettes (POT_WIN gold/amber, ALL_IN fire, SHOWDOWN cool); `getAnimationTheme(event)` with cache; optional `streakColor`/`haloColor`.
- **Layers:** Easing (ease-out in, ease-in out); theme timing (`burstScale`, `ringScale`) wired to Burst and Ring; headline scale 0.92→1; glow shadow offset; FLASH, BURST, PARTICLES, RING, TEXT, ASSET (stub).
- **Overlay:** Theme resolved per channel; `onComplete` via ref so effect doesn’t depend on callback identity.
- **Code quality:** Theme cache by event; `TEXT_SHADOW_OFFSET_NONE` constant; overlay effect deps reduced.

### Docs
- Roadmaps: TABLE_FX_ROADMAP, TABLE_FX_SUMMARY, TABLE_FX_ACTION_PLAN, TABLE_FX_OPTIMIZATION_ANALYSIS, TABLE_FX_PRO_DESIGN_TASKS.
- Proposals: TABLE_FX_PRO_DESIGN, TABLE_FX_DESIGN_PASS, TABLE_FX_CODE_QUALITY_REVIEW, TABLE_ANIMATION_* (assets, controls, reusable layers, etc.).

### Out of scope for this push
- ASSET layer real playback (Lottie/WebM).
- SEAT/HERO anchor resolution.
- Phase B (headline/amount styles: outline, flat).
- Phase D (FLASH sweep, BURST rotation, RING pulse).
- Reduced motion path.

---

## Manual smoke test (after deploy to staging)

1. **Table load** — Open a table; confirm no errors; overlay mounts.
2. **POT_WIN** — Trigger a pot win (e.g. win a hand); confirm center FX (flash, burst/ring, text) with **gold/amber** palette.
3. **ALL_IN** — Trigger all-in; confirm **red/orange** palette and headline.
4. **SHOWDOWN** — Trigger showdown; confirm **cool blue/purple** palette.
5. **Tier** — If possible, trigger different pot sizes / tiers; confirm higher tier = more layers/intensity, not broken.
6. **Sound** — POT_WIN tier 1+ should play table.potWin cue if sound enabled.
7. **Completion** — Animation clears after duration; no stuck overlay; onComplete fires.

---

## Commit suggestion

Group changes into 1–2 commits if desired:

1. **FX system:** registry refactor, theme + per-event palettes, layers (easing, theme timing, headline/glow), overlay (per-channel theme, onComplete ref), code quality (theme cache, constants).
2. **Docs:** roadmaps and proposals for FX (summary, pro design, design pass, code quality, staging checklist).

Then run verification again after commit, before push.

**Note:** Table FX overlay was updated to satisfy `react-hooks/exhaustive-deps` (cleanup uses captured functions, not ref). Any remaining lint errors in the repo (e.g. e2e/test.ts, DealerAnnounceBar, action-bar) are outside the FX scope for this push.
