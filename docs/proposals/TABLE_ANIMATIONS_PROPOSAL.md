# Table Animations — Goals & Overview

Event-driven table animations (pot win, all-in, showdown) that scale by tier, are definition-driven, and stay decoupled from game logic. Detailed architecture is split into:

- **[TABLE_ANIMATION_SYSTEM.md](./TABLE_ANIMATION_SYSTEM.md)** — Trigger contract, overlay runtime, collision rules, anchor, types.
- **[TABLE_ANIMATION_LAYOUT_WIN.md](./TABLE_ANIMATION_LAYOUT_WIN.md)** — Pot win layout (layers, no slots).
- **[TABLE_ANIMATION_DEFINITIONS.md](./TABLE_ANIMATION_DEFINITIONS.md)** — Registry authority, lookup, particle schema, TEXT payload.

---

## Goals

| Goal | Description |
|------|-------------|
| **Event-triggered** | Animations start from game events (pot win, all-in, showdown). |
| **Progressive intensity** | Tier 0–4 from context (pot size, hand strength); definitions define layers and duration. |
| **Layers only** | One system: layers in array order. No slots. |
| **Decoupled** | Game logic emits `TableAnimationRequest`; overlay never reads game state. |
| **Low CPU** | Native-driver animations; definition-driven; no per-frame JS. |
| **Definitions authoritative** | Duration, intensity, and layers live only in the registry. |

---

## Trigger example

```ts
requestTableAnimation({
  event: "POT_WIN",
  tier: mapPotWinTier({ potCents, winningHandDescr }),
  payload: { headline: "YOU WIN", amountCents: potCents }
})
```
