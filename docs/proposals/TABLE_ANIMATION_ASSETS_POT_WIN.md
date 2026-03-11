# Pot Win — Visual Assets

**Event**: `POT_WIN`  
**Tiers**: 0–1 (basic pot win: small pot, low hand strength).

---

## When it runs

Hand ends; hero or another player wins the pot. Tier 0–1 from mapper (pot size and hand strength low).

---

## Layers used

| Tier | Layers |
|------|--------|
| 0 | RING, TEXT (headline), TEXT (amount) |
| 1 | FLASH, RING, TEXT (headline), TEXT (amount) |

No BURST or PARTICLES at these tiers.

---

## Assets to develop

| Layer | Purpose | Spec |
|-------|---------|------|
| **RING** | Win ring around table center | Gold/warm stroke or texture; subtle. |
| **TEXT headline** | “YOU WIN” / “Winner” / “[Name] wins” | Small–medium (22–28 px); no glow. |
| **TEXT amount** | Formatted pot amount (e.g. “$12.50”) | Badge/pill + ~24 px. |
| **FLASH** (tier 1) | Full-area base | Soft warm overlay; short duration. |

---

## Proposed assets

| Asset | Deliverable | Format |
|-------|-------------|--------|
| Ring | `ring-pot-win.png` or stroke color spec | PNG/SVG with alpha, or hex + stroke width (e.g. 3 px). |
| Headline type | Font or type spec for small/medium | 22 px, 28 px; weight 800; no glow. |
| Amount badge | `amount-badge-pot-win.png` or color spec | Pill shape; fits 24 px text; padding for “$X,XXX”. |
| Flash (tier 1) | Color or `flash-pot-win.png` | Hex + opacity, or radial gradient PNG. |

---

## Design props

Design specifies; devs wire in registry or theme.

| Prop | Suggested | Where used |
|------|------------|------------|
| `ringColor` | e.g. `#D4A84B` (warm gold) | Ring stroke. |
| `headlineColor` | `#fff` + shadow | Headline text. |
| `headlineSize` | small: 22, medium: 28 | TEXT layer `textSize`. |
| `amountBadgeBg` | e.g. `rgba(180, 120, 60, 0.9)` | Amount pill background. |
| `flashColor` | e.g. `rgba(255, 220, 180, 0.25)` | FLASH overlay. |
| `totalDurationMs` | 1200 (tier 0), 1400 (tier 1) | Definition `durationMs`. |

Position: table center (fixed). No burst/particles; no ray or particle assets.

---

## Design intent

Understated, warm. Minimal motion; reads as “you won” without drama.
