# Table Animations — Controls & Designer Assets

How developers control **size**, **position**, and **animation speed**, and what **designers** should produce.

---

## How developers control it

### Speed

| Control | Where | What it does |
|--------|--------|----------------|
| **Total length** | `animationRegistry.ts` — each definition has `durationMs` | Length of the whole effect (e.g. 1200–2200 ms). |
| **Per-layer duration** | Layer def: `durationMs`, `delayMs` | How long the layer animates; when it starts. |
| **Defaults** | `DEFAULT_LAYER_PARAMS` in `animationRegistry.ts` | `flashDurationMs`, etc., when a layer omits values. |

Change speed by editing the **definition** for that event/tier in `TABLE_ANIMATIONS`, or by changing `DEFAULT_LAYER_PARAMS`.

### Size

| Control | Where | What it does |
|--------|--------|----------------|
| **Headline text** | Layer def: `textSize: "small" \| "medium" \| "large" \| "xlarge"` | Maps to 22 / 28 / 36 / 48 px in `TextLayer.tsx` (`SIZE_MAP`). |
| **Amount text** | Hardcoded in `TextLayer.tsx` | 24 px; badge styling in component. |
| **Burst** | Layer def: `rays` (count). Scale: hardcoded in `AnimationLayerBurst.tsx` (0.3 → 1.2). | Ray count from registry; scale only in code today. |
| **Particles** | Layer def: `particleCount`, `particleSpread` | Count and spread from registry; particle **pixel size** (8×8) is hardcoded in `AnimationLayerParticles.tsx`. |
| **Ring** | Hardcoded in `AnimationLayerRing.tsx` | Scale 0.8 → 1.1; stroke width 3; margin 12. |

To change **text size scale**: edit `SIZE_MAP` in `TextLayer.tsx`. To change **burst/ring/particle** scale or pixel size: edit the layer component. Optional: add `scale` / `opacity` from layer def into components (types already support it).

### Position

| Control | Where | What it does |
|--------|--------|----------------|
| **Overlay** | `TableAnimationOverlay.tsx` | Full-screen; `position: absolute`, left/right/top/bottom 0. |
| **Layers** | Each layer component | `StyleSheet.absoluteFill`; content **centered** (table center). |
| **Amount line** | `TextLayer.tsx` | `paddingTop: 56` so it sits below headline. |
| **Anchor** | Definition has `anchor: "TABLE_CENTER"` | Not used for layout yet; future `SEAT` will drive seat-relative position. |

Position is effectively **table center** for all current effects. To add seat- or hero-relative position later, use `anchor` and `payload.anchorSeat` in the overlay/layout.

---

## What designers should make

All assets are for **table-center** layout. Export at **1x**; scaling is done in code where needed.

| Asset | Used by | Format | Spec |
|-------|---------|--------|------|
| **Headline type** | TEXT (headline) | Font or spec | Weights/sizes: 22, 28, 36, 48 px. Optional glow style for tier 3+. |
| **Amount badge** | TEXT (amount) | Background shape (e.g. pill) or color spec | Fits ~24 px text; padding for “$X,XXX”. |
| **Flash overlay** | FLASH | Optional: PNG/SVG (e.g. radial gradient) | Full-area; alpha for blend. Or color only (code). |
| **Burst ray** | BURST | Optional: single ray PNG/SVG | Repeated/rotated; or code-only. |
| **Particle sprite** | PARTICLES | 1–3 small sprites, e.g. 16×16 or 24×24 | Spark / chip / star; alpha. |
| **Ring** | RING | Optional: ring PNG/SVG with glow | Or code stroke only. |

**Copy**: Headlines (“YOU WIN”, “ALL IN”, “Winner”) and amount format are from the app; designers only need type and badge style, not final strings.

**Palette**: Designers can define one palette (e.g. gold/warm) or variants per event (e.g. red/orange for all-in, blue/silver for flush). Delivered as color tokens or small color-keyed assets; devs wire in theme or layer components.
