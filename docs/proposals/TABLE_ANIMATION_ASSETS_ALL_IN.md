# All-In — Visual Assets

**Event**: `ALL_IN`  
**Tiers**: 0–4 (moment someone goes all-in; intensity by pot/amount).

---

## When it runs

A player goes all-in. Tier from mapper (pot size and all-in amount). Shown at the all-in moment, not at showdown.

---

## Layers used

| Tier | Layers |
|------|--------|
| 0 | TEXT (headline only) |
| 1 | FLASH, TEXT (headline) |
| 2 | BURST, FLASH, TEXT (headline) |
| 3 | BURST, PARTICLES, FLASH, TEXT (headline) |
| 4 | BURST, PARTICLES, FLASH, TEXT (headline), TEXT (amount) |

Headline copy: “ALL IN”. Amount only at tier 4.

---

## Assets to develop

| Layer | Purpose | Spec |
|-------|---------|------|
| **TEXT headline** | “ALL IN” | Medium → xlarge; glow at tier 3+. |
| **FLASH** | Full-area base | Strong, short; red/orange energy. |
| **BURST** | Center radial rays | 6–16 rays; high contrast. |
| **PARTICLES** | Sparks from center | Optional: flame/chip sprite; 12–16 count. |
| **TEXT amount** (tier 4) | All-in amount | Badge; same as pot-win amount style. |

---

## Proposed assets

| Asset | Deliverable | Format |
|-------|-------------|--------|
| Headline type | Font or type spec for medium → xlarge | 28, 36, 48 px; glow style for tier 3+. |
| Flash | `flash-all-in.png` or color spec | Red/orange radial or solid; strong alpha. |
| Burst ray | `burst-ray-all-in.png` (optional) | Single ray PNG/SVG; repeat/rotate in code. |
| Particle | `particle-all-in.png` (1–2 variants) | 16×16 or 24×24; spark/flame; alpha. |
| Amount badge (tier 4) | Same as pot-win or `amount-badge-all-in.png` | Pill; 24 px text. |

---

## Design props

Design specifies; devs wire in registry or theme.

| Prop | Suggested | Where used |
|------|------------|------------|
| `headlineColor` | `#fff` + red/orange shadow | “ALL IN” text. |
| `headlineSize` | medium → xlarge (28–48 px); glow tier 3+ | TEXT layer `textSize`, `textGlow`. |
| `flashColor` | e.g. `rgba(255, 80, 40, 0.4)` | FLASH overlay. |
| `burstColor` | e.g. `rgba(255, 100, 50, 0.6)` | Burst rays. |
| `burstRays` | 6 (tier 2) → 16 (tier 4) | Layer def `rays`. |
| `particleColor` / sprite | Tint or sprite | PARTICLES. |
| `particleCount` | 12–16 | Layer def. |
| `totalDurationMs` | 1000–2200 by tier | Definition `durationMs`. |

Position: table center. Amount (tier 4): same vertical offset as pot-win (headline → amount).

---

## Design intent

High tension. “ALL IN” is the hero; support with flash and burst. Red/orange palette; intense but not long.
