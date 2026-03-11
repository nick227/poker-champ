# Table FX — Inspiration Reflection

Comparison of three reference screens (ALL IN, Winner with pot/chips, Matte Winner) to our FX system, and what we can absorb. Our baseline is the current implementation after the “punch” pass (larger type scale, tighter choreography, bolder burst/glow/particles).

---

## How the inspiration differs from ours

### 1. Scale and dominance of headline

| Inspiration | Our system |
|-------------|------------|
| “ALL IN” / “WINNER” often **25–40% of viewport height**, full width, feels like a hero moment | Headline is **fixed px** (small 24 → xlarge 56). No viewport-relative scaling |
| Pot/amount is clearly secondary: ~1/4–1/3 of headline size | Amount pill 26px; tier 4 headline 56px — good ratio but both fixed |
| Everything sized to feel “colossal” on the device | Sizes are consistent but not viewport-dominant on large screens |

**Takeaway:** Inspiration pushes **viewport dominance** for the main message. We use a strong fixed scale; the gap is on tablets/large phones where 56px doesn’t dominate. Absorb: consider a **viewport- or container-relative scale** for headline (and optionally amount) so “WINNER” / “ALL IN” can read as hero-sized on any device.

---

### 2. Burst: thin rays vs. luminous field

| Inspiration | Our system |
|-------------|------------|
| **ALL IN:** Strong radial streaks and particles from center; light feels like it’s *emitting* from the text | **Burst:** 3px rays, scaleX 75, scale 0.2→1.35 — still “rays” not a solid field |
| **Winner (matte):** Dense **halftone-style radial burst** behind “WINNER” — dots/lines, luminous background that *is* the glow | We have a **flash** (full-bleed wash) + **burst** (rays) + **text glow** (shadow). No dense radial “sunburst” behind the type |
| **Winner (luxe):** Strong **starburst** behind “WINNER” as a primary element | Same as above: burst is present but not yet a “light source” behind the word |

**Takeaway:** Reference art uses the burst as a **luminous backdrop** for the headline, not just thin rays. We can absorb: (1) **stronger, denser burst** — more rays and/or a second layer (e.g. soft radial gradient or dot field) behind the headline; (2) optionally a **halftone/dotted** style for a matte look; (3) keep flash + burst but make burst read as “light behind the text” (e.g. higher opacity, larger final scale, or a dedicated “headline burst” layer).

---

### 3. Glow: simple shadow vs. multi-stage fire/metallic

| Inspiration | Our system |
|-------------|------------|
| **ALL IN:** Multi-stage glow — bright core → yellow-orange → red; feels like fire | **Headline glow:** inner radius 16, outer 26, single glow color (plus dual-tone for ALL_IN) |
| **Winner (luxe):** 3D **metallic gold** — bevel, reflections, hard shadows; text has weight and depth | We use **flat text + shadow glow**; no bevel, no 3D, no metallic treatment |
| Glow often **is** the burst (light behind text), not only a text-shadow | Our glow is text-shadow; burst is separate |

**Takeaway:** We can absorb **richer glow** without going full 3D: (1) **Multi-tone glow** — e.g. bright center (white/yellow) fading to palette color (orange/red) via multiple shadow layers or a gradient mask; (2) **stronger outer spread** for top tiers (e.g. outer 26→32+); (3) Optional: subtle **second highlight** (lighter sliver) to suggest bevel — CSS/text-shadow only. Full metallic 3D would need assets or a different pipeline.

---

### 4. Particles: abstract circles vs. confetti/chips/sparks

| Inspiration | Our system |
|-------------|------------|
| **Matte winner:** **Geometric confetti** — circles, squares, triangles, short lines; flat gold; **dense and wide** | **Particles:** 10×10 circles, spread 28–60, count 8–16; single shape |
| **Luxe winner:** **Orbiting chips**, falling confetti, **sparks around pot**; themed assets (chips, coins) | We have abstract circles; no chips/confetti assets; no orbit or “sparks at amount” |
| **ALL IN:** Many small sparks, fast diagonal streaks; high density | We have **streak** (4 lines, 180×2) and particles; density and variety are lower |

**Takeaway:** Absorb in stages: (1) **Shape variety** — allow particle “kind” (circle, square, line) in theme or layer config; render as simple View shapes (no assets yet). (2) **Density and spread** — increase count and max spread for POT_WIN / top tiers so it feels like a shower. (3) **Optional:** “Sparks at amount” — a small particle burst origin at the amount pill (we already have `originOffsetY` for ALL_IN headline). (4) **Later:** Themed assets (chip/confetti sprites) for a luxe tier.

---

### 5. Amount pill: supporting vs. part of the spectacle

| Inspiration | Our system |
|-------------|------------|
| Pot/amount is **large**, sometimes with **counter/digit animation** and **sparks** around it | Amount is 26px, pill with border; no counter animation; no dedicated spark origin |
| Often **same gold treatment** as headline (luxe) or integrated with central glow (ALL IN) | We use palette (amountBg, amountBorder); can match event but no shared “fiery” treatment with headline |
| Visual connection to headline via shared glow or framing | Headline and amount are one stack with 56px gap; no shared glow frame |

**Takeaway:** (1) **Larger amount** for top tiers — e.g. allow `textSize` or amount font from theme so tier 4 can use “large” amount. (2) **Sparks at amount** — particle layer with origin at the amount position (or a second particle burst keyed to amount delay). (3) **Shared frame** — optional subtle ring or gradient behind headline+amount stack so they read as one “moment.” (4) **Counter animation** — digit roll/count-up is a larger feature; document as future enhancement.

---

### 6. Choreography: one “hit” vs. staggered sequence

| Inspiration | Our system |
|-------------|------------|
| Feels like **one big moment** — burst, glow, and headline read as simultaneous or near-instant | We use **stagger:** flash 0 → burst 35 → particles 45 → ring 75 → headline 90 → amount 140 ms |
| Secondary info (pot, cards) appears after the main hit | We already put headline before amount; timing is already tighter after punch |

**Takeaway:** Inspiration favors **density of impact** over long sequence. We’re already in a good place; optional tweak: **compress further** so headline lands at ~60–70 ms and amount at ~100–120 ms for a single “boom” feel, or add a **simultaneous** variant where flash + burst + headline start within 0–30 ms and only amount is delayed.

---

### 7. Thematic consistency and accents

| Inspiration | Our system |
|-------------|------------|
| **Gold borders** on winning cards; **distinct frame** (e.g. circle) for winner avatar | FX overlay only; no card or avatar styling in our scope |
| **Fiery theme** applied to slider, buttons, and cards as well as FX | We only drive overlay FX; UI (buttons, slider) is separate |
| Consistent gold/red/orange language across the screen | Per-event palettes (POT_WIN, ALL_IN, SHOWDOWN) give consistency within the overlay |

**Takeaway:** Card/avatar treatment is **outside** the current FX overlay. We can document that a “bold and dramatic” product feel should extend to: (1) card borders or glow when they’re part of a win, (2) winner avatar frame. FX system can expose **tokens** (e.g. `haloColor`, `headlineGlow`) so the rest of the UI can reuse the same palette.

---

## What we can absorb (prioritized)

### Do now (no new assets, small API surface)

1. **Viewport- or container-relative headline scale**  
   - One optional size tier (e.g. `hero`) that uses `min(viewWidth * 0.12, 72)` or similar so headline can dominate on any device.
2. **Stronger burst behind headline**  
   - Increase burst opacity or add a soft radial “glow blob” layer behind center (e.g. large blurred circle keyed to burst timing) so the burst reads as “light behind the text.”
3. **Multi-tone headline glow**  
   - For `textGlow: true`, add a second shadow (e.g. bright center + palette outer) in `TextLayer` to approximate the fire gradient.
4. **Particle shape variety**  
   - Theme or layer option: `particleShape: 'circle' | 'square' | 'line'`; render in `AnimationLayerParticles` as different View shapes (no new assets).
5. **Sparks at amount**  
   - Preset option: particle layer with `originOffsetY` (and optional `originOffsetX`) set so the burst is centered on the amount pill (e.g. for POT_WIN tier 4).

### Do next (config + content)

6. **Denser particles for POT_WIN**  
   - Higher `particleCount` and `particleSpread` for POT_WIN top tiers; optional “confetti” preset with more, wider particles.
7. **Larger amount for top tiers**  
   - Allow amount to use a theme size (e.g. “large”) for tier 3–4 so it scales with the headline.
8. **Optional “instant impact” choreography**  
   - Preset or variant where flash + burst + headline start within 0–30 ms, amount at ~100 ms.

### Later (assets or big features)

9. **Halftone / dotted burst**  
   - Alternative burst style (dense dots in radial pattern) for a matte look; likely a new layer type or asset.
10. **Themed particle assets**  
    - Chip/coin/confetti sprites for a luxe tier; requires asset pipeline and possibly Lottie or sprite sheet.
11. **Amount counter animation**  
    - Digit roll or count-up for the pot value; separate component and animation.
12. **Card/avatar accent tokens**  
    - Document and expose FX palette tokens so cards and winner avatar can use the same gold/red/purple language.

---

## Summary

- **Scale:** We’re bolder than before; inspiration goes further with viewport-dominant headline and optional hero scale.
- **Burst:** Ours is rays; theirs is often a **luminous field** behind the text — add density or a soft radial layer so burst reads as “light behind the word.”
- **Glow:** We have single/dual-tone; they use **multi-stage fire** and sometimes 3D metallic — we can add a second highlight and stronger spread without 3D.
- **Particles:** We have circles; they use **confetti shapes and density** — add shape variety and higher count/spread; optionally sparks at amount.
- **Amount:** We can make it **part of the spectacle** (larger on top tiers, sparks at pill, shared frame) and later consider counter animation.
- **Choreography:** We’re already tight; we can offer an “instant impact” variant (flash + burst + headline almost simultaneous).

This doc is the single place to track inspiration vs. current behavior and to pull from when implementing the next “bold and dramatic” pass.
