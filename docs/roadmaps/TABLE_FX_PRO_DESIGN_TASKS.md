# Table FX Pro Design — High-Level Task List

Implementation tasks to ship the [TABLE_FX_PRO_DESIGN.md](../proposals/TABLE_FX_PRO_DESIGN.md) vision. Order is dependency-friendly; each block is shippable.

---

## Phase A: Theme & per-event palettes

**Goal:** One dominant hue per event (POT_WIN gold/amber, ALL_IN fire, SHOWDOWN cool). Designers tune via theme, not layer code.

| # | Task | Notes |
|---|------|--------|
| A1 | Add per-event theme resolution | `getAnimationTheme(event)` returns event-specific palette when defined, else default. |
| A2 | Define three palette presets in theme | `potWin` (warm gold/amber), `allIn` (red–orange), `showdown` (blue–purple). Wire to event key. |
| A3 | Optional theme keys | Add `streakColor`, `haloColor` to palette type and default theme for future FLASH sweep / hero. |
| A4 | Pass resolved theme into all layers | Overlay resolves theme once per request; every procedural layer receives theme (or keys) via props. |

**Done when:** Switching event changes colors (flash, burst, ring, particle, headline glow, amount pill) without editing definitions.

**Status:** Done. `getAnimationTheme(event)` returns per-event palette (POT_WIN gold/amber, ALL_IN red–orange, SHOWDOWN blue–purple); `streakColor`/`haloColor` added; overlay passes resolved theme to all layers.

---

## Phase B: Text treatment (headline & amount)

**Goal:** Headline = glow (default), outline, or flat. Amount = pill (default) or flat. Supports SHOWDOWN outline look and reduced motion.

| # | Task | Notes |
|---|------|--------|
| B1 | Extend layer def types | TEXT layer: optional `headlineStyle?: 'glow' | 'outline' | 'flat'`, `amountStyle?: 'pill' | 'flat'`. |
| B2 | TextLayer: headline styles | Render glow (current), outline (stroke only), flat (fill, no glow). Read from def + theme. |
| B3 | TextLayer: amount styles | Pill = current rounded bg; flat = no pill, optional subtle bg. Read from def. |
| B4 | Registry: assign styles per event/tier | e.g. SHOWDOWN use outline; tier 0 use flat for headline; high tiers use glow. |

**Done when:** Definitions can request outline or flat; reduced-motion path can use flat/minimal type.

---

## Phase C: Motion & choreography

**Goal:** Ease-out in, ease-in out; stagger preserved; tier = intensity (rays, particles, scale), not speed.

| # | Task | Notes |
|---|------|--------|
| C1 | Standardize easing on layers | Burst, ring, flash: ease-out for entrance/scale; ease-in for exit. Replace linear where used. |
| C2 | Particle motion | Short arc or drift + fade; ease-out on position, ease-in on opacity out. |
| C3 | Audit stagger | Ensure defs use 50–150 ms delays between layers so flash → burst → ring → text reads clearly. |
| C4 | Tier = intensity only | Confirm tier drives ray count, particle count, duration/sustain, type size—not animation speed. |

**Done when:** All procedural animations use consistent easing; tier scaling is intensity-based.

---

## Phase D: Layer knobs (FLASH, BURST, RING)

**Goal:** Optional FLASH sweep/direction, BURST rotation, RING pulse. Config-driven, optional per def.

| # | Task | Notes |
|---|------|--------|
| D1 | FLASH: optional direction/sweep | Layer def: `flashDirection?: 'full' | 'radial' | 'sweep'`; sweep = directional streak (e.g. toward center). Single variant first. |
| D2 | BURST: optional rotation | Layer def: `rotationSpeed?: number` (e.g. deg/s). Tier scales ray count only. |
| D3 | RING: optional pulse | Layer def: `ringPulse?: boolean`; subtle scale in/out on sustain. Theme or def. |
| D4 | Theme timing for new knobs | Expose sweep angle/duration, rotation speed, pulse scale range where needed. |

**Done when:** ALL_IN (or one event) can use FLASH sweep; BURST can rotate; RING can pulse when specified.

---

## Phase E: ASSET layer (Lottie/WebM)

**Goal:** One hero clip per event at top tier; center-safe, transparent, short. ASSET layer plays real media.

| # | Task | Notes |
|---|------|--------|
| E1 | AssetLayer: real playback | Play Lottie or WebM from `source`; respect `durationMs` or intrinsic; optional `containsAudio`. |
| E2 | Preload wiring | Overlay calls `onPreloadAssets(sources)` on mount; app preloads ASSET sources to avoid first-play hitch. |
| E3 | One ASSET per event (tier 4) | Add optional ASSET layer to POT_WIN_TIER_4, ALL_IN_TIER_4, SHOWDOWN_TIER_4 with placeholder or real source. |
| E4 | Center-safe, short | Art direction: clips 0.8–1.6 s, transparent, no overlap with headline safe area. |

**Done when:** ASSET layer plays; preload runs; at least one definition uses ASSET (can be placeholder URL until art ready).

---

## Phase F: Reduced motion

**Goal:** Fewer particles, no sweep, shorter durations, flat/minimal type when `reducedMotion` is true.

| # | Task | Notes |
|---|------|--------|
| F1 | Overlay: reducedMotion branch | When settings.reducedMotion, request a “reduced” variant or pass flag into resolver/layers. |
| F2 | Reduced definitions or tier clamp | Option A: add reduced defs (e.g. fewer particles, no sweep). Option B: clamp to lower tier + layer-level overrides. |
| F3 | Text: flat headline, minimal amount | In reduced path, force headlineStyle flat, amountStyle flat where possible. |
| F4 | No FLASH sweep in reduced path | If FLASH sweep exists, disable for reduced motion. |

**Done when:** Toggling reduced motion shortens and simplifies FX without breaking layout.

---

## Phase G: Hero & seat (deferred)

**Goal:** Secondary beats—hero halo, seat glow—after anchor resolution exists. Not blocking pro design.

| # | Task | Notes |
|---|------|--------|
| G1 | HERO anchor resolution | Overlay resolves HERO position; render one stack (e.g. RING + PARTICLES) at hero, smaller scale. |
| G2 | SEAT anchor resolution | Resolve position from `payload.anchorSeat` + table layout; render seat glow or small burst. |
| G3 | Theme: heroScale, heroRingColor, seatGlowColor | Per-event or global; short duration so they don’t compete with table center. |

**Done when:** Hero win / all-in can show halo; seat can show active/bust glow. Track in backlog until anchor work is scheduled.

---

## Summary

| Phase | Scope | Dependency |
|-------|--------|------------|
| A | Per-event palettes, theme resolution | None |
| B | Headline/amount styles | A (theme in TextLayer) |
| C | Easing, stagger, tier = intensity | None |
| D | FLASH sweep, BURST rotation, RING pulse | A (theme) |
| E | ASSET playback, preload, one clip per event | Existing ASSET stub |
| F | Reduced motion path | A, B, D |
| G | Hero & seat | Anchor resolution (backlog) |

**Suggested order:** A → B and C in parallel → D → E → F. G when anchors are implemented.
