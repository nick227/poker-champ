# Table Animation Layout — Pot Win (Winning Hand)

Layout used for **POT_WIN** animations. Companion to [TABLE_ANIMATION_SYSTEM.md](./TABLE_ANIMATION_SYSTEM.md). No slots; layers only, order = array order.

---

## Layout type: Pot Win

All pot-win animations use the same **layer stack**. Intensity and length vary by **tier** (0–4). Tier is chosen by the mapper from pot size and hand strength; the definition registry holds one definition per `(POT_WIN, tier)`.

---

## Layers (back to front = array order)

Layers are visual primitives in definition order. Typical order for POT_WIN:

1. **FLASH** — full-area base
2. **BURST** — center radial rays
3. **PARTICLES** — center-emitted sparks
4. **RING** — center frame / ring
5. **TEXT** (role: headline) — primary line ("YOU WIN", "Winner")
6. **TEXT** (role: amount) — secondary line (formatted amount)

Lower tiers use a subset (e.g. tier 0: RING, TEXT headline, TEXT amount). No separate "slots"; if a layer is in the array, it renders in that position.

---

## Intensity by tier

| Tier | Layers typically used | Intent |
|------|------------------------|--------|
| 0 | RING, TEXT×2 | Minimal |
| 1 | FLASH, RING, TEXT×2 | Add flash |
| 2 | BURST, FLASH, RING, TEXT×2 | Add burst |
| 3 | BURST, PARTICLES, FLASH, RING, TEXT×2 | Add particles |
| 4 | All, max params | Max impact |

Exact content is in the definition registry; this table is descriptive only.

---

## Anchor

All POT_WIN definitions use `anchor: "TABLE_CENTER"`. Overlay centers content on the table. Future events (e.g. seat knockout) may use `SEAT` or `HERO`.

---

## Duration

Duration lives in the definition (`durationMs`). No duration bands; each definition has one total duration. POC: normal lengths only (~1–2.2 s per tier).
