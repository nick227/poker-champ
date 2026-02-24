# Sound Effects Event Wiring Guide

## Purpose

This document defines how sound effects should be wired in client code and what to improve next.
Core decision: semantic `SoundEvent` must be the public interface; `SoundKey` stays internal to the sound system.

## Current Stack (As Implemented)

1. Registry layer (`what exists`)
   - `apps/client/src/registry/sound.registry.ts`
   - `SoundKey -> { asset, category, cooldownMs, maxInstances, volume? }`
2. Policy layer (`can it play`)
   - `apps/client/src/lib/sound.ts`
   - gates by preferences, master volume, and cooldown
3. Player layer (`how it plays`)
   - `apps/client/src/lib/soundPlayer.ts`
   - `expo-av` pooled playback by key
4. Bootstrap layer
   - `apps/client/src/bootstrap/sdk.ts`
   - registers player + preloads selected keys

## Biggest Architectural Smell

Components currently choose `SoundKey` directly (`playSound("tap")`, `playSound("cardDeal")`), coupling UI logic to audio identity.

This blocks easy changes like:

- sound swaps
- A/B audio variants
- accessibility/minimal-audio profiles
- platform-specific packs

## Required Missing Layer: Semantic Event Router

Add a layer above policy:

`emitSoundEvent("table.handStart")`
`-> resolve event to key`
`-> playSound(key)`

### Target flow

`Component -> emitSoundEvent(SoundEvent) -> SoundEventMap -> SoundKey -> SoundRegistry -> Player`

Only the event map knows which key is used.

## Naming Rule

- `SoundEvent`: semantic meaning (`ui.tap`, `table.handStart`, `table.heroTurn`)
- `SoundKey`: audio identity (`tap`, `cardDeal`, `yourTurn`)

Never expose `SoundKey` outside sound infrastructure.

## Event Boundary Rule (Hard Rule)

Attach sounds to confirmed state transitions, not raw user intent.

| Location | Good? | Why |
|---|---|---|
| `Button.tsx` | No | reusable chrome; no domain validity/success context |
| `TableScreenController` | Yes | knows action validity + dispatch success |
| `ToastStore.show()` boundary | Yes | canonical notification emission point |
| Hand/pot resolver internals | No | domain logic should stay UI/audio-agnostic |

## Current Wiring Snapshot

### Attached now

- `tap`: base `Button`, `IconButton`, `ChipButton`
- `modalOpen` / `modalClose`: `ModalSheet`
- table actions (`fold/check/call/bet/raise/allIn`): `useTableScreenController` on dispatch success
- `cardDeal`: `TableLayout` when community revealed count increases

### Gaps

1. `VoiceBarControls` has no sound wiring.
2. Initial hand-start deal is not explicit (`cardDeal` is currently board-reveal driven).
3. Unused keys today: `cardFlip`, `chipStack`, `chipBet`, `potWin`, `yourTurn`, `handReveal`, `toast`, `tableBell`, `error`.
4. Missing reconnect semantic cues:
   - `reconnectStart`
   - `reconnectSuccess`
   - `reconnectFail`

## Cooldown Policy Update

`SoundKey` cooldown is necessary but not enough.

Problem:

- If `table.handStart` and `table.boardReveal` both map to `cardDeal`, key-level cooldown can suppress one event unexpectedly.

Rule:

- Cooldown belongs primarily to `SoundEvent`.
- Key-level cooldown is fallback default.

Example:

- `table.handStart`: 200ms
- `table.boardReveal`: 60ms
- both may still map to `cardDeal`

## Preload Rule

Preload only if at least one is true:

- used during active gameplay
- used during animation-critical interactions
- likely in first 2 seconds of app use

Do not preload rare/low-impact sounds (`toast`, `error`, rare achievements).

## How To Attach Sound (Reuse Existing Audio)

Use this when existing key fits.

1. Define/select semantic event (not key) at boundary.
2. Map event to existing key in event map.
3. Emit event only when action is valid and confirmed.
4. Add event-emission transition test.

### Example: `VoiceBarControls` click

- Event: `ui.tap` (or `voice.toggle` if product wants distinct telemetry/controls).
- Keep `tap` key reuse unless distinct asset is explicitly needed.
- Rule: `VoiceBarControls` must not import `SoundKey` or `playSound`; it emits events only.

## How To Attach Sound (Add New Audio)

1. Add asset under `apps/client/assets/sounds/<category>/` (lowercase kebab-case).
2. Add `SoundKey` + static `require(...)` in `sound.registry.ts`.
3. Add key defaults (`cooldownMs`, `maxInstances`, optional `volume`).
4. Add/choose `SoundEvent` and map to key in event map.
5. Add preload entry only if it satisfies preload rule.
6. Add deterministic transition tests for event emission.

## Deterministic Testing Strategy

Do not test audio playback in feature tests. Test event emission.

Pattern:

- Given previous snapshot X and next snapshot Y
- Expect emitted `SoundEvent` list (`table.handStart`, `table.heroTurn`, etc.)

Keep player mechanics tests in `soundPlayer` tests.

## Coverage Strategy (Simple First)

Add dev-only runtime stats:

- `emittedEvents: Set<SoundEvent>`
- `playedKeys: Set<SoundKey>`

Expose debug view with:

- registered events/keys
- emitted/played
- never-used events/keys

## Recommended Module Layout

- `apps/client/src/sound/soundEvents.ts`
  - `SoundEvent` type + optional event metadata defaults
- `apps/client/src/sound/soundEventMap.ts`
  - `Record<SoundEvent, SoundKey>`
- `apps/client/src/sound/emitSoundEvent.ts`
  - event-level cooldown + routing to `playSound`

## Example Blueprint

```ts
// soundEvents.ts
export type SoundEvent =
  | "ui.tap"
  | "table.handStart"
  | "table.boardReveal"
  | "table.heroTurn"
  | "table.potWin";
```

```ts
// soundEventMap.ts
import type { SoundKey } from "@/registry/sound.registry";
import type { SoundEvent } from "./soundEvents";

export const SOUND_EVENT_MAP: Record<SoundEvent, SoundKey> = {
  "ui.tap": "tap",
  "table.handStart": "cardDeal",
  "table.boardReveal": "cardDeal",
  "table.heroTurn": "yourTurn",
  "table.potWin": "potWin",
};
```

## Immediate Priorities

1. Introduce `SoundEvent` types + map + emitter.
2. Route new wiring through events (start with table transitions and voice controls).
3. Move cooldown control to event level with key-level fallback.
4. Add transition tests for hand start, board reveal, hero turn, reconnect states.

## Guardrails

- ESLint blocks direct `@/lib/sound` imports in feature code.
- Allowed exceptions are infrastructure/sound internals (`src/sound/**`, `src/lib/sound.ts`, `src/bootstrap/sdk.ts`) and `src/tests/sound.policy.test.ts`.
