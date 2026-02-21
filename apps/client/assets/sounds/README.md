# Sound Assets

Place SFX files in `assets/sounds/<category>/` and wire them in
`apps/client/src/registry/sound.registry.ts`.

## Current rollout state

- All `SoundKey` entries are currently mapped to concrete asset files.
- Some sounds are seeded from test clips and can be replaced with final production SFX later.
- `placeholder.mp3` is kept as a safe fallback option for future keys or temporary mappings.

## Naming convention

- lowercase only
- kebab-case only
- no spaces

Examples:

- `assets/sounds/ui/tap.wav`
- `assets/sounds/action/bet.wav`
- `assets/sounds/table/card-deal.wav`

## Add a sound

1. Add `.wav` or `.mp3` file under `assets/sounds/<category>/`.
2. Update `SOUND_MAP` entry in `apps/client/src/registry/sound.registry.ts`:
   - use a static `require(...)` asset (or temporary placeholder fallback when needed).
3. Keep `cooldownMs`, `maxInstances`, and optional `volume` tuned for UX.
4. Ensure event mapping exists at a boundary call-site (button/modal/action/table).
