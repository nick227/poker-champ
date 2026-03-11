# Table FX — Design & Art Direction

Designer and graphic-art guide for table animations: composition, color, type, motion, and config that supports craft. Fits the existing event/tier/layer system.

---

## 1. Composition & space

**Focal point:** Table center is the stage. Everything else (hero cards, seats, controls) supports it. FX should pull the eye to one moment—the headline—then let the amount and pot read as supporting info.

**Negative space:** Dark background is part of the design. Glows and particles gain impact from contrast; avoid filling the frame. Let effects breathe: short bursts, then fade. Crowding kills hierarchy.

**Z-order (back → front):**  
Flash (ambient) → Burst / assets (direction) → Particles (energy) → Ring (focus) → Headline (message) → Amount (data).  
Each layer has a job. Don’t stack two “hero” treatments (e.g. heavy burst + heavy ring); alternate weight.

**Safe area:** Keep a clear band for headline and amount. No particle clusters or ray hits that obscure type. Text is the contract with the player; effects are atmosphere.

---

## 2. Color & light (graphic art)

**Temperature and meaning:**  
- **Warm (gold, amber, soft orange)** = reward, win, positive. Use for POT_WIN.  
- **Hot (red–orange, ember)** = risk, commitment, intensity. Use for ALL_IN.  
- **Cool (blue–purple, steel)** = tension, resolution, clarity. Use for SHOWDOWN.

**Glow as material:** Glow reads as light, not flat fill. Use a core color (headline white/cream) plus a colored halo (theme: headlineGlow). Halos should feel like bloom, not a thick outline—soft falloff, one dominant hue per event so the screen doesn’t become mud.

**Contrast:** Headline must read on dark and on flash. Prefer light type + colored glow over dark type. Amount pill: dark enough to read the number, light enough to feel part of the moment (e.g. deep red pill, white number for ALL_IN; golden tint for POT_WIN).

**Palette discipline:** One dominant hue per event. Accent with a second (e.g. gold + soft orange for pot win; red + orange for all-in). Avoid three competing saturated colors in one stack.

---

## 3. Type as graphic element

**Headline:** It’s a poster moment. Weight and size (small → xlarge) scale with tier. Treatment options:  
- **Glow** — Core type + soft halo; default for high impact.  
- **Outline** — Stroke only, no fill; use when you want sharp, editorial look (e.g. SHOWDOWN).  
- **Flat** — Solid fill, no glow; use for minimal tiers or reduced motion.

**Amount:** Data, not drama. Pill (rounded container) keeps it legible and contained. Same font family as headline but subordinate: smaller, less glow. Don’t animate amount like the headline—quick in, hold, out.

**Readability:** Headline = 1–3 words, all caps or title case as per copy. No decorative type that sacrifices legibility. Glow radius and blur stay behind the letterforms so edges stay crisp.

---

## 4. Motion language

**Easing:** No linear. Use ease-out for entrances (fast in, settle); ease-in for exits (slow leave). Burst and ring: ease-out from center. Particles: short arc or drift, then fade.

**Choreography:** Stagger layers by small delays (e.g. 50–150 ms) so the eye sees flash → burst → ring → text, not one blob. Total duration 0.8–1.6 s; peak impact in the first 400–600 ms.

**Restraint:** One main motion per layer (scale, opacity, or position—not all three at once). Particles move; headline can scale in subtly; ring expands. No constant jitter or multiple competing animations.

**Tier as intensity:** Higher tier = more rays, more particles, longer sustain, maybe larger type. Not “faster”—same rhythm, fuller.

---

## 5. Per-event art direction

**POT_WIN — “You won”**  
- Mood: Warm, satisfying, earned.  
- Light: Soft golden/amber flash; ring like a soft sunburst; particles like faint confetti or chips settling.  
- Type: Headline with gentle glow; amount in a warm pill (e.g. deep amber/red).  
- Don’t: Aggressive red, strobe, or cold tones.

**ALL_IN — “Commitment”**  
- Mood: High stakes, fire, edge.  
- Light: Red–orange flash; burst rays like energy streaks; particles like embers or sparks. Optional directional sweep (e.g. streak into center).  
- Type: Headline with stronger glow, possible particle burst from type; amount secondary.  
- Don’t: Cute, soft, or passive. This is the peak moment.

**SHOWDOWN — “Reveal”**  
- Mood: Cool, decisive, clarity.  
- Light: Cool tint (blue–purple) on ring/burst; sharper ring; fewer, cleaner particles.  
- Type: Clean emphasis; outline treatment fits. No warm glow.  
- Don’t: Celebratory confetti or warm gold; keep it tense and clear.

---

## 6. Layer craft (what each effect does)

| Layer | Role | Designer knobs |
|-------|------|-----------------|
| **FLASH** | Ambient wash; sets temperature. | Color, opacity, duration. Optional: direction (sweep) or shape (full / radial). |
| **BURST** | Direction and energy from center. | Ray count, length, color, optional slow rotation. Tier = more rays, not faster. |
| **PARTICLES** | Life and grain. | Count, spread, color (from theme), falloff. Sparse reads premium; dense reads chaotic. |
| **RING** | Focus and punctuation. | Scale range, thickness, color. Optional pulse (subtle in/out). |
| **TEXT** | Message and data. | Headline: style (glow / outline / flat), size, glow color. Amount: pill vs flat, contrast. |
| **ASSET** | Signature moment (Lottie/WebM). | One hero clip per event at high tier; transparent, short, center-safe. |

**Combining:** Odd number of “heavy” layers (e.g. one of burst/ring/particles strong; others support). FLASH + RING + TEXT is a valid minimal stack; add BURST or PARTICLES for higher tiers, not all at once.

---

## 7. Config that serves the craft

Theme (or per-event override) should expose:

- **Palette:** flash, burst, ring, particle, headline, headlineGlow, amountBg, amountText; optional streakColor, haloColor.
- **Timing:** flashDurationMs, burstScale, ringScale; per-layer durationMs/delayMs in defs.
- **Intensity:** Tier drives ray count, particle count, scale max; optional opacity curve.
- **Text treatment:** headlineStyle (flat | glow | outline), amountStyle (pill | flat).
- **Variant:** Per-event key (e.g. potWin: "gold", allIn: "fire", showdown: "cool") selects palette + optional ASSET set.

Implement via `getAnimationTheme(event)` and optional layer-level overrides so one code path supports many looks.

---

## 8. Hero & seat (secondary beats)

**Hero:** Short halo or pulse around hero cards—same RING/PARTICLE language, smaller scale, HERO anchor. Color ties to event (e.g. gold on pot win, red on all-in). Don’t compete with table-center; shorter duration.

**Seat:** Glow border or small burst at seat for active/bust/big bet. SEAT channel; position from layout. Single color, short duration. Supports the story; doesn’t tell it.

---

## 9. Deliverables (designer + dev)

- [ ] Per-event palettes and treatments: POT_WIN gold/amber, ALL_IN fire, SHOWDOWN cool.
- [ ] Headline styles: glow (default), outline, flat. Amount: pill (default), flat.
- [ ] Tier scaling: rays, particles, scale, sustain—no speed race.
- [ ] Optional FLASH sweep/direction; BURST rotation; RING pulse where theme supports.
- [ ] One ASSET (Lottie/WebM) per event for top tier, center-safe, transparent.
- [ ] Reduced motion: fewer particles, no sweep, shorter durations, flat/minimal type.

---

## 10. References

- **Implementation tasks:** [TABLE_FX_PRO_DESIGN_TASKS.md](../roadmaps/TABLE_FX_PRO_DESIGN_TASKS.md) — high-level task list (phases A–G).
- Spec & registry: [TABLE_FX_ROADMAP.md](../roadmaps/TABLE_FX_ROADMAP.md), [TABLE_FX_SUMMARY.md](../roadmaps/TABLE_FX_SUMMARY.md).
- Controls & assets: [TABLE_ANIMATION_CONTROLS_AND_ASSETS.md](./TABLE_ANIMATION_CONTROLS_AND_ASSETS.md).
