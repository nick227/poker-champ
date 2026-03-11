# Flush Win — Visual Assets

**Event**: `POT_WIN`  
**Tiers**: 3–4 (big hand, e.g. flush; tier from pot + hand strength).

---

## When it runs

Hand ends; winner has a strong hand (e.g. flush, full house). Tier 3–4 from mapper (pot size + hand-strength boost).

---

## Layers used

| Tier | Layers |
|------|--------|
| 3 | BURST, PARTICLES, FLASH, RING, TEXT (headline), TEXT (amount) |
| 4 | BURST, PARTICLES, FLASH, RING, TEXT (headline), TEXT (amount) — more rays/particles, headline glow |

Full stack; tier 4 has more rays (16), more particles, longer duration, textGlow.

---

## Assets to develop

| Layer | Purpose | Spec |
|-------|---------|------|
| **BURST** | Center radial rays | 12–16 rays; premium feel (e.g. gold or blue/silver). |
| **PARTICLES** | Center-emitted sparks | 12–16; optional star/spark sprite. |
| **FLASH** | Full-area base | Softer than all-in; celebratory. |
| **RING** | Win ring | Gold or premium accent; can match burst. |
| **TEXT headline** | “YOU WIN” / “Winner” | Xlarge; glow at tier 4. |
| **TEXT amount** | Pot amount | Badge; same as pot-win. |

---

## Proposed assets

| Asset | Deliverable | Format |
|-------|-------------|--------|
| Burst ray | `burst-ray-flush.png` (optional) | Gold or blue/silver; single ray or starburst. |
| Particle | `particle-flush.png` (1–2 variants) | 16×24 or 24×24; star/spark; alpha. |
| Flash | `flash-flush.png` or color spec | Softer gradient; celebratory. |
| Ring | `ring-flush.png` or color spec | Gold or premium accent; optional glow. |
| Headline type | Font/spec for xlarge + glow | 48 px; weight 800; glow at tier 4. |
| Amount badge | Same as pot-win or flush variant | Pill; 24 px text. |

---

## Design props

Design specifies; devs wire in registry or theme.

| Prop | Suggested | Where used |
|------|------------|------------|
| `burstColor` | Gold `#D4A84B` or blue/silver accent | Burst rays. |
| `burstRays` | 12 (tier 3), 16 (tier 4) | Layer def `rays`. |
| `particleColor` / sprite | Gold or blue/silver tint / star sprite | PARTICLES. |
| `particleCount` | 12–16; `particleSpread` 50–60 | Layer def. |
| `flashColor` | e.g. `rgba(255, 220, 180, 0.2)` (softer than all-in) | FLASH overlay. |
| `ringColor` | Match burst; e.g. gold or silver | Ring stroke. |
| `headlineColor` | `#fff` + shadow; glow at tier 4 | TEXT; `textGlow: true` tier 4. |
| `headlineSize` | xlarge (48 px) | TEXT layer. |
| `totalDurationMs` | 1800 (tier 3), 2200 (tier 4) | Definition `durationMs`. |

Position: table center. Amount: same vertical offset as pot-win.

---

## Design intent

Premium, celebratory. Big hand deserves full stack (burst, particles, ring, headline, amount). Optional: blue/silver accent to distinguish from basic pot win (gold).
