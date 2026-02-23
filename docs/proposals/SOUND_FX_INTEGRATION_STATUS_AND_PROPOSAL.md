# Sound FX Integration: Current Status and Proposal

## Scope

This document captures:

- current implementation status of client sound effects
- key gaps that block production-ready SFX
- a proposal to properly implement `apps/client/src/registry/sound.registry.ts` as the source of truth

## Rollout Status (Current)

- Phase 1 complete: registry is asset-backed and typed (`satisfies Record<SoundKey, SoundDefinition>`).
- Phase 2 complete: `masterVolume`, cooldown policy, polyphony-aware player, preload support.
- Phase 4A/4B/4C complete: tap + modal + table action boundary call-sites are wired.
- Phase 4D complete: `cardDeal` trigger on revealed community-card deltas is wired.
- Phase 5 partial: cooldown/master-volume/polyphony tests are in place.
- Asset rollout complete for registry coverage: all current `SoundKey` entries are mapped to concrete bundled assets (seeded clips, can be replaced with final SFX iteratively).

## Current Status (as implemented)

## Registry

File: `apps/client/src/registry/sound.registry.ts`

- `SoundKey` and `SoundCategory` are defined with good domain coverage (`ui`, `table`, `action`, `outcome`, `notification`).
- `SOUND_MAP` maps each `SoundKey` to static bundled assets (`require(...)`) and policy metadata.
- `getSound()` and `getSoundsByCategory()` exist and are usable.
- `withPlaceholder(...)` centralizes fallback behavior so missing real assets do not require player changes.

## Playback API

File: `apps/client/src/lib/sound.ts`

- A central `playSound(key)` API exists.
- Playback is correctly gated by `preferences.soundEnabled`.
- `masterVolume` is applied and clamped, and zero volume short-circuits playback.
- cooldown ownership is centralized in `sound.ts`.
- `setSoundPlayer()` allows runtime player injection.
- `usePlaySound()` hook exists for React call-sites.

## Player Implementation

File: `apps/client/src/lib/soundPlayer.ts`

- `expo-av` is configured.
- Audio mode is initialized once.
- Player uses per-key pooled `Audio.Sound` instances and enforces `maxInstances`.
- Player supports preload/dispose and logs failures once in development without throwing.

## Bootstrap

File: `apps/client/src/bootstrap/sdk.ts`

- `setSoundPlayer(createExpoAvPlayer())` is called during bootstrap.
- high-frequency keys are preloaded (`tap`, `modalOpen`, `check`, `call`, `bet`, `cardDeal`).
- Player wiring is active globally.

## Preferences

File: `apps/client/src/stores/preferences.store.ts`

- `soundEnabled` exists, defaults to `true`, and is persisted.
- `masterVolume` exists, defaults to `1`, is persisted, and is clamped to `[0,1]`.

## Integration Coverage

- Base pressables (`Button`, `IconButton`, `ChipButton`) trigger `tap`.
- `ModalSheet` triggers `modalOpen`/`modalClose`.
- table action dispatch triggers action sounds on successful send.
- `TableLayout` triggers `cardDeal` when revealed board-card count increases.

## Problems to Solve

1. `source` is metadata only; playback does not resolve it to a real asset.
2. Expo bundling does not support dynamic `require(sourceString)` at runtime for local assets.
3. No typed mapping from `SoundKey` to Expo asset module (`require(...)` output).
4. No polyphony cap per sound key, so rapid events can spam overlapping audio.
5. No master volume control for future UX settings.
6. No preload/unload lifecycle for production performance and memory safety.
7. No rollout map for where each game/UI event should emit which `SoundKey`.
8. Silent-failure behavior is implied but not explicitly contract-defined.
9. No explicit asset naming convention; entropy risk increases over time.

## Proposal

## 1) Make the registry asset-backed (not string-backed)

Replace string-only source metadata with static asset refs that Expo can bundle:

- keep `SoundKey` and categories in registry
- use `asset: number` from static `require(...)` calls
- keep optional metadata (`volume`, `cooldownMs`, `maxInstances`, `category`)
- enforce completeness with `satisfies Record<SoundKey, SoundDefinition>`

Suggested shape:

```ts
export type SoundDefinition = {
  asset: number; // static require(...) result
  category: SoundCategory;
  volume?: number;
  cooldownMs?: number;
  maxInstances?: number; // default 1
};
```

This keeps `sound.registry.ts` as the single source of truth and makes playback deterministic.

Type-level completeness pattern:

```ts
const SOUND_MAP = {
  // ...
} satisfies Record<SoundKey, SoundDefinition>;
```

## 2) Upgrade player to keyed cache + real asset playback

In `soundPlayer.ts`:

- cache `Audio.Sound` per `SoundKey`
- load from `definition.asset` (not placeholder)
- track active instances per key
- enforce polyphony via `maxInstances` (default `1`)
- if active count is at limit, skip or restart oldest instance
- replay with `replayAsync()`
- expose `disposeAllSounds()` for app teardown/testing

Result: each key plays its own real effect with stable runtime behavior.

## 3) Keep `sound.ts` as orchestration/policy layer

`sound.ts` should stay the public API:

- preference gating remains here
- cooldown enforcement should live here (policy, not I/O)
- apply `finalVolume = (def.volume ?? 1) * masterVolume`
- call-sites only import `playSound`/`usePlaySound`

This avoids direct `expo-av` usage in domain/UI components and keeps player logic focused on transport/runtime only.

Suggested cooldown state:

```ts
const lastPlayed = new Map<SoundKey, number>();
```

## 4) Add global master volume (future-proofing)

In preferences store:

- add `masterVolume?: number` with default `1`
- persist it with existing preferences
- no UI is required yet, but playback should respect it immediately

Volume formula:

- `finalVolume = (def.volume ?? 1) * (masterVolume ?? 1)`
- clamp to `[0, 1]`

## 5) Add warm-preload hook (optional, recommended)

Add a preload API:

- `preloadSounds(keys: SoundKey[])`

Preload high-frequency sounds at bootstrap:

- `tap`
- `modalOpen`
- `check`, `call`, `bet`
- `cardDeal`

Lazy-load all other sounds on first use.

## 6) Add event-to-sound mapping policy

Create a lightweight map/table in docs or a dedicated module:

- UI press -> `tap`
- modal open/close -> `modalOpen` / `modalClose`
- betting actions -> `check` / `call` / `bet` / `raise` / `allIn` / `fold`
- dealing/reveal -> `cardDeal` / `cardFlip` / `handReveal`
- notifications -> `toast` / `error` / `tableBell`

Then add sound calls at the domain boundaries (action dispatchers, modal controls, toast pipeline), not in low-level presentational atoms.

## 7) Add tests for registry + policy contracts

Add focused tests that verify:

- every `SoundKey` has a definition
- category lookups return valid keys
- no duplicate/missing definitions after key changes
- cooldown blocks re-fire inside threshold
- final volume respects `masterVolume`
- player never throws to caller on load/play failure
- polyphony cap is enforced per key

This prevents silent drift as the game expands.

## 8) Add explicit silent-failure contract

If a sound fails to load or play, the system must:

- log once in development
- never throw
- never block game flow

This contract should be documented and tested.

## 9) Add asset naming convention

Choose one scheme and enforce it:

- option A (prefix): `ui_tap.mp3`, `action_bet.mp3`, `table_card_deal.mp3`
- option B (folder-based): `assets/sounds/<category>/<name>.mp3`

For either scheme:

- lowercase only
- kebab-case file names
- no spaces

## Recommended Rollout Plan

1. Refactor registry to static assets and typed definitions.
2. Add `masterVolume` in preferences and wire volume composition in `sound.ts`.
3. Refactor Expo player to consume registry assets, keyed cache, and polyphony limits.
4. Add `preloadSounds(keys)` and preload high-frequency keys at bootstrap.
5. Replace placeholder behavior fully.
6. Integrate 5-8 high-impact call-sites first (tap, modal, action, toast).
7. Add tests and a short developer guide for adding new sounds.

## Acceptance Criteria

- Triggering `playSound("bet")` plays real bet SFX (not placeholder).
- `soundEnabled=false` suppresses all playback.
- All `SoundKey` entries resolve to bundled assets.
- Per-key polyphony limit prevents spam overlap.
- Volume respects `masterVolume`.
- Preloaded keys avoid first-interaction lag.
- No crashes/noise if an asset fails to load (fail-safe no-op with single warning log in dev).
- At least one table action flow and one UI modal flow emit correct sounds.
- Registry uses `satisfies Record<SoundKey, SoundDefinition>` completeness enforcement.

## Notes

- `expo-av` is deprecated upstream in some Expo tracks; if the project plans to migrate to `expo-audio`, keep `sound.ts` unchanged and swap only the player implementation.
- Keep registry and event mapping explicit; avoid dynamic path conventions that bypass type safety.

## Developer Snippet

To add a sound:

1. Drop `.mp3` in `assets/sounds/<category>/`.
2. Add `SoundKey`.
3. Add `SOUND_MAP` entry with static `require(...)`.
4. Optionally add event mapping at a domain boundary.
5. Done.
