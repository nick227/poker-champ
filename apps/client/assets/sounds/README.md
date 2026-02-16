# Sound assets

Place per-key sound files here (or in subdirs) and wire them in the sound player.

- `placeholder.mp3` – used for all keys until per-key assets exist (see `src/lib/soundPlayer.ts`).
- Paths are defined in `src/registry/sound.registry.ts` (e.g. `sounds/ui/tap.mp3`).

Replace or add files and update the player’s asset map to use `require()` for each key.
