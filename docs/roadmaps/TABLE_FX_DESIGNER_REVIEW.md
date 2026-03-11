# Table FX — Designer Review

Review of the FX system from a **designer perspective**: size, proportion, hierarchy, position, and style. All values are as implemented (px, unless noted).

---

## 1. Size & proportion

### Type scale

| Size   | px  | Use in presets                    |
|--------|-----|-----------------------------------|
| small  | 22  | POT_WIN tier 0 headline           |
| medium | 28  | Tier 0 headline (ALL_IN, SHOWDOWN), POT_WIN tier 1 |
| large  | 36  | Tier 1–2 headline                 |
| xlarge | 48  | Tier 3–4 headline (glow)          |
| amount | 24  | Amount pill (fixed; not from scale) |

**Observations**

- **Ratio:** 22 → 28 → 36 → 48 is roughly 1.27–1.29 between steps. Not a strict modular scale (e.g. 1.25) but close; readable progression.
- **Amount vs headline:** Amount is 24px while tier 0–1 headlines are 22–28. So amount can sit between small and medium headline size, which keeps it secondary. For tier 4 (headline 48), 24 is half — clear hierarchy.
- **Gap:** xlarge 48 vs large 36 is a big jump (+12px). Tier 3 and 4 both use xlarge; only glow and duration differ. If you add a “tier 3.5” later, consider an intermediate size (e.g. 40) or keep as-is for simplicity.

### Decorative elements (absolute)

- **Burst rays:** 2px thick, scaleX 60 → effective length ~120px from center. Scale 0.3 → 1.2 so they read as thin rays, not blocks.
- **Ring:** 3px stroke, margin 12px inset. Scale 0.8 → 1.1 so it stays a thin frame.
- **Particles:** 8×8px, borderRadius 4 (circle). Spread 28–60px, count 8–16. On high-DPI or large tablets 8px can feel small; consider a scale factor from viewport or density later.
- **Streak lines:** 180×2px, 4 lines. Length is fixed; on very wide screens they may feel short relative to the frame.

**Proportion summary**

- Headline is the largest graphic element (up to 48px). Ring and burst are thin and frame the center. Particles are small accents. That supports “headline first, decoration second.”
- One weakness: **all typography and decorative sizes are fixed px.** There is no responsive or density scaling, so on tablets or very small phones the same px can feel off. Document that as a known limitation; a future pass could drive sizes from layout or density.

---

## 2. Hierarchy

### Visual priority (by design)

1. **Headline** — Largest type, centered, scale-in from 0.92, optional dual-tone glow. Reads as the main message.
2. **Amount** — Secondary: smaller (24), below headline (56px), pill shape and border so it’s clearly a supporting chip/value.
3. **Ring** — Frames center; scale 0.8→1.1 and 3px stroke keep it supportive, not dominant.
4. **Burst / particles** — Energy and emphasis; they don’t compete with type because they’re thin/small and choreographed to lead in before headline.
5. **Flash** — Full-screen wash; lowest priority, sets mood.
6. **Streak** — Ambient; soft and diagonal so it stays in the background.

### Choreography (time)

Delays (ms) fix the order in time:

- Flash 0 → Burst 50 → Particles 60 → Ring 100 → Headline 120 → Amount 180.

So the eye gets: flash → burst/particles → ring → headline → amount. That matches the intended hierarchy (headline and amount last, as primary and secondary info).

**Observation**

- Amount at 180ms is 60ms after headline. That’s a clear “second line” and avoids both appearing at once. Good.

---

## 3. Position

### Center and stacking

- Everything is **center-anchored** in the overlay (absoluteFill + justifyContent/alignItems center). Headline, ring, burst, and particles all share the same visual center. No offset between “effect center” and “text center” except where explicitly added.
- **Amount pill:** Same horizontal center as headline; vertically it’s **headline + 56px down** (paddingTop on the amount wrap). So there’s a fixed 56px gap between baseline area of headline and top of the pill. That’s a single constant; on small screens 56px can feel large, on big screens possibly tight. Worth keeping as a single token (e.g. `HEADLINE_TO_AMOUNT_GAP`) for future tuning.

### Offsets

- **Particles from headline (ALL_IN tier 4):** originOffsetY 40 moves the particle burst center 40px down from center, so it reads as “from the headline” rather than from table center. That’s the only content-driven offset. Good for narrative.
- **Ring:** margin 12 on all sides shrinks the ring inward; it doesn’t sit on the very edge of the overlay. That keeps a bit of breathing room.
- **Streak:** Lines are centered (marginLeft -90, marginTop -1 for 180×2); random offset ±20px adds variety without breaking center balance.

### Anchored positioning (HERO/SEAT)

- When anchorBounds are provided, the whole stack (flash, burst, particles, ring, text) is positioned inside the hero or seat rect. So **position hierarchy** is “one block” — no internal repositioning of headline vs amount inside the rect. If the rect is short, headline + 56px + amount could get cramped. Consider minimum height or internal flex when you use anchored mode.

---

## 4. Style

### Typography

- **Headline:** fontWeight 800, letterSpacing 2. Always white (theme headline #fff) with glow color from palette. Strong weight and spacing read as “display” rather than body.
- **Amount:** fontWeight 700, so slightly lighter than headline. Pill: padding 16h/8v, borderRadius 8, optional 2px border (amountBorder). Same white text; background and border carry the chip look.

**Consistency**

- One headline style (weight + letterSpacing) for all events; only size and glow change by tier/event. Amount is one style. That keeps the system coherent.

### Color and event identity

- **POT_WIN:** Warm gold/amber (flash, burst, ring, particle); amount bg and border warm. Reads as “win.”
- **ALL_IN:** Hot red/orange; headlineGlowSecondary deep red for dual-tone; amount and streak more aggressive. Reads as “risk / all-in.”
- **SHOWDOWN:** Cool purple/violet; softer. Reads as “reveal / showdown.”

Palettes are distinct; no style bleed between events. Opacity and saturation are tuned so flash doesn’t wash out the UI (e.g. flash ~0.28–0.38).

### Decorative style

- **Burst:** Single color per event; thin rays (2px); no gradient. Reads as graphic, not illustration.
- **Ring:** Single color, constant stroke width. Simple frame.
- **Particles:** Single color, circles; size variation 0.75–1.25 for a bit of organic feel.
- **Streak:** Single color, 2px lines; subtle (opacity in theme ~0.35–0.65). Supports depth without pulling focus.

Overall the style is **flat, graphic, and type-led** — no textures or heavy illustration. That fits a mobile game HUD that must read quickly.

---

## 5. Designer summary: what’s strong, what to watch

**Strong**

- Clear **size hierarchy**: headline (22–48) > amount (24) > decorative elements (thin rays, 8px particles, 2px streak).
- **Choreography** reinforces that hierarchy (headline and amount last).
- **Center alignment** and single “headline + 56px + amount” stack keep layout predictable.
- **Event palettes** give distinct tone without changing proportions or structure.
- **Dual-tone glow and amount border** add depth and “fire/chip” without breaking the system.

**Worth watching**

- **Fixed px everywhere** — No density or viewport scaling. Fine for one device class; if you support phones and tablets, consider a scale factor or layout-driven sizes.
- **56px headline→amount gap** — Single constant; tune if you add anchored (hero/seat) layouts or very small/large screens.
- **8px particles** — Can feel small on large screens; 24px amount might feel small next to 48px headline on tablet. Optional: tie particle size and amount size to a “FX scale” derived from overlay size.
- **Ring margin 12** — Keeps the ring off the edge; if the overlay is ever full-screen on a very large display, 12px might feel small. Easy to expose as a token later.
- **Streak length 180** — Fixed; on ultrawide or tablet you might want length or count to scale. Low priority.

**Recommendation**

- No structural change needed for hierarchy or position. For polish: (1) name key spacing/size tokens (e.g. HEADLINE_TO_AMOUNT_GAP, PARTICLE_SIZE_PX) so designers can tune in one place; (2) when you add responsive or multi-device support, consider one FX scale factor from overlay or safe area; (3) keep event palettes and type scale as the main style levers.
