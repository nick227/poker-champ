# Table Animation Definitions

Registry content and lookup. Companion to [TABLE_ANIMATION_SYSTEM.md](./TABLE_ANIMATION_SYSTEM.md). Definitions are the single source of truth for what runs per event and tier.

---

## Authority

- **Tier** → which definition runs (event + tier).
- **Duration** → `durationMs` on each definition.
- **Intensity** → which layers and params (rays, particleCount, textSize, textGlow) are in that definition.

No global tier rules or slot tables elsewhere. All behavior comes from the registry.

---

## Lookup

```ts
resolveAnimation(event: TableAnimationEvent, tier: number): TableAnimationDefinition | undefined
```

- Clamp tier to 0–4; look up `(event, tier)`.
- Fallback to `(event, 0)` if missing.

---

## Layer order

Render layers in **array order**. No zIndex; no slots. First element = back, last = front.

---

## Particle schema (layer type PARTICLES)

When `type: "PARTICLES"`, layer definition may include:

- `particleCount?: number` — default 12
- `particleSpread?: number` — max distance from center (logical units), default 50

Other params (velocity, gravity, sprite) can be added later; same schema for all implementations.

---

## TEXT layer and payload

- `textRole: "headline"` → display `payload.headline`.
- `textRole: "amount"` → display formatted `payload.amountCents` (e.g. `$123.45`).

Overlay reads only from `request.payload`; no game state. Missing payload fields yield empty or fallback text.
