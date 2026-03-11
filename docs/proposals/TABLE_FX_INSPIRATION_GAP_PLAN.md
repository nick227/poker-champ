# Table FX — Inspiration Gap: Plan & Implementation

Closing the gap to the ALL IN concept image. Phased plan and what we ship in this pass.

---

## Phase 1 (this pass) — Center stack

### 1.1 Headline “fire” depth
**Gap:** Image has orange–red gradient / dual-tone glow on “ALL IN” text.  
**Approach:** No gradient component in table FX; use **dual-tone glow** for fire feel.  
**Tasks:**
- Add optional `headlineGlowSecondary` to theme palette (e.g. darker red for outer glow).
- TextLayer: when `glow` is true and `headlineGlowSecondary` is present, apply a second text shadow (larger radius, secondary color) so the headline has a two-tone glow.
- ALL_IN theme: set `headlineGlowSecondary` (e.g. deep red); POT_WIN/SHOWDOWN can leave unset.

### 1.2 Particles from headline area
**Gap:** Image shows sparks/embers erupting from the “ALL IN” text.  
**Approach:** Allow PARTICLES to use an **origin offset** so a second burst can be placed “at” the headline (below center).  
**Tasks:**
- Add optional `originOffsetX?: number`, `originOffsetY?: number` to procedural layer (PARTICLES only; ignored elsewhere).
- AnimationLayerParticles: accept `originOffsetX`, `originOffsetY` (default 0); position the particle center at (50% + offsetX, 50% + offsetY).
- renderAnimationLayer: pass through from layer def.
- Registry: ALL_IN tier 4 (and optionally 3) add a **second** PARTICLES layer with `originOffsetY: 40`, smaller `particleSpread` (28) and `particleCount` (8) so it reads as embers from the text. Use same CHOREO_HEADLINE_MS or slightly after (e.g. 130) so it fires with the headline.

### 1.3 Pot chip styling
**Gap:** Image has “TOTAL POT” in a strong red–orange glowing frame.  
**Approach:** Treat as **amount pill** with optional border/glow from theme.  
**Tasks:**
- Add optional `amountBorder?: string` to theme palette (glow-like border color).
- TextLayer (amount role): when `amountBorder` is present, set `borderWidth: 1` (or 2) and `borderColor: amountBorder` so the pill has a clear frame.
- Per-event theme: ALL_IN (and optionally POT_WIN) set `amountBorder` for the chip look.

---

## Phase 2 (backlog)

- **Hero aura / trails:** HERO anchor resolution + RING/PARTICLES at hero; directional streaks (new layer or FLASH variant).  
- **Seat glow:** SEAT anchor resolution + glow border per seat.  
- **Background streaks/particles:** New layer or FLASH variant (directional).  
- **Slider flame trail:** UI control animation, outside FX overlay.

---

## Implementation order (Phase 1)

1. Theme: add `headlineGlowSecondary`, `amountBorder` to palette type and per-event overrides (ALL_IN, optionally POT_WIN).  
2. TextLayer: dual-tone glow when glow + headlineGlowSecondary; amount border when amountBorder.  
3. animationTypes: add `originOffsetX?`, `originOffsetY?` to ProceduralLayerDefinition.  
4. AnimationLayerParticles: origin offset props; position center by offset.  
5. renderAnimationLayer: pass originOffsetX/Y to Particles.  
6. Registry: ALL_IN tier 4 (and 3) add second PARTICLES layer with originOffsetY 40, spread 28, count 8, delayMs 130.
