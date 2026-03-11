# Table Animation System

Architecture for event-driven table animations: trigger contract, overlay runtime, collision rules. No game state in the animation layer.

---

## 1. Animation event types (canonical)

Single enum. No synonyms elsewhere (no "pot win", "winning hand", "hand result").

```ts
type TableAnimationEvent = "POT_WIN" | "ALL_IN" | "SHOWDOWN"
```

---

## 2. Animation request (trigger contract)

The only thing game logic sends. Animation runtime never reads game state. Include `version` to protect against breaking UI changes.

```ts
const TABLE_ANIMATION_REQUEST_VERSION = 1

type TableAnimationRequest = {
  version?: typeof TABLE_ANIMATION_REQUEST_VERSION
  event: TableAnimationEvent
  tier: 0 | 1 | 2 | 3 | 4
  payload?: {
    headline?: string
    amountCents?: number
    potCents?: number
    winnerSeat?: number
    isHero?: boolean
    anchorSeat?: number   // future: seat-based anchor
  }
}
```

---

## 2b. Animation settings (kill switch)

For accessibility, low-end devices, and debugging. Overlay checks before running.

```ts
type AnimationSettings = {
  enabled: boolean
  reducedMotion: boolean
}
```

Default: `{ enabled: true, reducedMotion: false }`. Pass as optional overlay prop.

---

## 3. Anchor system

Effects can originate from different parts of the table. Definitions declare `anchor`; overlay positions content accordingly (future: seat knockout, hero glow, dealer chip).

```ts
type AnimationAnchor = "TABLE_CENTER" | "HERO" | "SEAT"
```

POC: all definitions use `TABLE_CENTER`. SEAT/HERO used when we add seat-specific or hero-specific effects.

---

## 4. Layer types (visual primitives)

Minimal set. Not poker-specific.

```ts
type AnimationLayerType = "FLASH" | "BURST" | "PARTICLES" | "RING" | "TEXT"
```

Rendering order = layer array order (no separate slot or zIndex).

---

## 5. Layer definition

Pure data. TEXT uses `textRole` to pick headline vs amount from payload. Particles have explicit schema.

```ts
type AnimationLayerDefinition = {
  type: AnimationLayerType
  delayMs?: number
  durationMs?: number
  scale?: [number, number]   // [from, to]
  opacity?: [number, number]
  // BURST
  rays?: number
  // PARTICLES
  particleCount?: number
  particleSpread?: number
  // TEXT
  textRole?: "headline" | "amount"
  textSize?: "small" | "medium" | "large" | "xlarge"
  textGlow?: boolean
}
```

---

## 6. Animation definition (registry entry)

Definitions are authoritative. No global tier rules elsewhere; duration and layers live only here. Each definition has a stable `id` (e.g. `POT_WIN_TIER_3`) for telemetry.

```ts
type TableAnimationDefinition = {
  id: string
  event: TableAnimationEvent
  tier: number
  anchor: AnimationAnchor
  durationMs: number
  layers: AnimationLayerDefinition[]
}
```

Lookup: `resolveAnimation(event, tier)` → definition or **closest lower tier** if exact tier missing. Registry indexed as `Map<Event, Map<Tier, Definition>>` for O(1) lookup.

---

## 7. Overlay runtime

Single consumer: `<TableAnimationOverlay />`.

- Receive request (from controller/context). Optionally receive `settings`, `onAnimationStart`, `onAnimationComplete`.
- If `settings.enabled === false`, do not run.
- Resolve definition via `resolveAnimation(request.event, request.tier)` (tier fallback to closest lower).
- Apply collision rules and MAX_ACTIVE_ANIMATIONS guard.
- Call `onAnimationStart?.(def)` then spawn layers in array order; run animations; on end call `onAnimationComplete?.(def)` and `onComplete()`.
- **ANIMATION_DEBUG**: set to `true` to log each animation (event, tier, id, layers, duration) for tuning.

---

## 8. Collision rules and max active guard

Prevent stacked or spamming animations.

- **MAX_ACTIVE_ANIMATIONS = 1** — hard cap; never run more than one at a time.
- If no animation running → run incoming.
- Else if incoming.tier > current.tier → replace (cancel current, run incoming).
- Else → ignore incoming.

Optional: queue later. POC: no queue.

---

## 9. Tier mapping (outside animation system)

Poker logic lives in a separate mapper. Animation system never imports poker types.

```ts
// animationMapper.ts
function mapPotWinTier(ctx: { potCents: number; handRank?: number; winningHandDescr?: string }): 0|1|2|3|4
function mapAllInTier(ctx: { potCents: number; amountCents: number }): 0|1|2|3|4
```

Trigger site calls mapper and passes result as `request.tier`.

---

## 10. Accessibility / reduced motion

- **AnimationSettings** (`enabled`, `reducedMotion`) passed to overlay. When `enabled: false`, no animations run. `reducedMotion` reserved for future use (e.g. shorten duration, disable particles).
- Respect system/user preference when available; wire settings from app prefs in follow-up.

---

## 11. Folder structure

```
table/animations/
  animationTypes.ts      # Event, Request, Anchor, LayerDef, Definition
  animationRegistry.ts   # TABLE_ANIMATIONS + resolveAnimation
  animationMapper.ts     # mapPotWinTier, mapAllInTier
  TableAnimationOverlay.tsx
  layers/
    FlashLayer.tsx
    BurstLayer.tsx
    ParticleLayer.tsx
    RingLayer.tsx
    TextLayer.tsx
```

---

## Summary

| Concern | Location |
|--------|----------|
| Event names | Strict enum in animationTypes |
| Request shape | Locked in animationTypes; overlay only sees request |
| What runs | Definitions in animationRegistry |
| Tier selection | animationMapper (poker context → 0–4) |
| Collision | Overlay runtime |
| Order | Layer array order |
