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
- **Tier fallback**: if exact tier is missing, use **closest lower tier** (e.g. tier 4 requested, tier 4 missing → use tier 3). Prevents silent failures.
- Registry indexed as `Map<Event, Map<Tier, Definition>>` for O(1) lookup.

---

## Layer order

Render layers in **array order**. No zIndex; no slots. First element = back, last = front.

---

## Default layer parameters

**DEFAULT_LAYER_PARAMS** centralizes defaults so definitions stay concise:

- `particleCount: 12`, `particleSpread: 50`
- `rays: 8`, `flashDurationMs: 300`, `burstScale: [0.3, 1.2]`

Layers omit params to use these; override per definition as needed.

---

## Particle schema (layer type PARTICLES)

When `type: "PARTICLES"`, layer definition may include:

- `particleCount?: number` — default from DEFAULT_LAYER_PARAMS (12)
- `particleSpread?: number` — default 50

Other params (velocity, gravity, sprite) can be added later; same schema for all implementations.

---

## TEXT layer and payload

- `textRole: "headline"` → display `payload.headline`.
- `textRole: "amount"` → display formatted `payload.amountCents` (e.g. `$123.45`).

Overlay reads only from `request.payload`; no game state. **amountCents** is primary for amount display (formatted as currency); potCents is optional metadata. Missing payload fields yield empty or fallback text.

---

## Definition validation

**validateDefinitions(TABLE_ANIMATIONS)** runs at module load. Rules:

- No duplicate `(event, tier)`.
- `layers` array not empty.
- `durationMs > 0`.
- Every TEXT layer has `textRole`.

Throws on violation to catch registry mistakes early.
