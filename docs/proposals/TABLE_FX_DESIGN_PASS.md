# Table FX — Design Pass: Critiques & Improvements

Visual and motion review of the current FX layers and theme, with concrete changes applied or recommended.

---

## 1. Critiques

### Motion: no easing
All layers use `Animated.timing` with no `easing`. Result: mechanical, flat feel. Design spec: ease-out for entrances (fast in, settle), ease-in for exits (slow leave).

**Fix:** Use `Easing.out` for opacity/scale in, `Easing.in` for opacity out on Flash, Burst, Ring, Particles, Text.

### Theme timing ignored
`animationTheme` defines `burstScale: [0.3, 1.2]` and `ringScale: [0.8, 1.1]`, but **Burst** and **Ring** layers hardcode scale ranges. Theme timing is only used for FLASH duration. Designers can’t tune burst/ring feel from theme.

**Fix:** Pass `theme.timing.burstScale` into AnimationLayerBurst and `theme.timing.ringScale` into AnimationLayerRing; use in animation config.

### Headline scale too aggressive
Headline animates scale 0.5 → 1. Design: “headline can scale in subtly.” A 0.5 start reads as a pop, not a settle.

**Fix:** Headline scale in from 0.92 → 1 (or 0.88 → 1) with ease-out.

### Glow flatness
Headline glow uses `textShadowOffset: { width: 0, height: 0 }` and when `glow` is true, `textShadowRadius: 12`. Zero offset can make glow look like a flat halo. A tiny vertical offset adds depth and keeps edges crisp.

**Fix:** Use a small offset (e.g. `height: 1`) for glow so shadow sits slightly behind/below; keep radius from theme/glow.

### Particles static
Particles animate opacity and scale from center but **don’t move**. Design: “short arc or drift, then fade.” They should feel like they emit and drift, not pop in place.

**Fix (recommended):** Animate each particle’s position slightly outward (or add a short delay spread) so they “drift” as they fade. Optional: per-particle delay for a ripple effect.

### Ring margin hardcoded
Ring uses `margin: 12`, so the circle is inset. On large screens it can feel small; theme has no control.

**Fix (optional):** Add `ringMargin` to theme timing or leave as-is and document; lower priority than easing and scale-from-theme.

---

## 2. Improvements applied (code)

- **Easing:** Flash, Burst, Ring, Particles, Text use `Easing.out` for entrance (opacity/scale in) and `Easing.in` for exit (opacity out).
- **Theme timing:** Burst receives `scaleRange: theme.timing.burstScale`; Ring receives `scaleRange: theme.timing.ringScale`. Layers use these for scale animation instead of hardcoded values.
- **Headline scale:** Headline scale-in changed from 0.5 → 1 to 0.92 → 1 with ease-out.
- **Glow depth:** Headline text shadow uses a small vertical offset when glow is true (e.g. `textShadowOffset: { width: 0, height: 1 }`) so glow reads as bloom behind the type.

---

## 3. Improvements recommended (later)

- **Particles drift:** Add optional outward position animation (or delay spread) so particles drift then fade; keep duration and stagger subtle.
- **Ring margin:** Expose `ringMargin` in theme if we need per-event or responsive ring size.
- **FLASH shape/direction:** Per design doc, optional FLASH sweep or radial shape is Phase D; no change in this pass.

---

## 4. Palette & contrast (verified)

- **POT_WIN:** Warm gold/amber; headline #fff + headlineGlow amber; amount pill dark amber — readable.
- **ALL_IN:** Red–orange; amountBg dark red — white amount text readable.
- **SHOWDOWN:** Blue–purple; amountBg dark purple — white amount text readable.

No contrast or palette bugs found; per-event palettes are applied correctly.

---

## 5. References

- [TABLE_FX_PRO_DESIGN.md](./TABLE_FX_PRO_DESIGN.md) — Motion language, type, layer craft.
- [TABLE_FX_PRO_DESIGN_TASKS.md](../roadmaps/TABLE_FX_PRO_DESIGN_TASKS.md) — Phase C (motion), Phase D (layer knobs).
