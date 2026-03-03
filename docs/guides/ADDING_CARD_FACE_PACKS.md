# Adding New Card Face Packs

This guide documents the exact process for adding a new local card-face set.

## Prerequisites

- You have a complete 52-card PNG set.
- Filenames must match this format exactly:
  - `<rank>_of_<suit>.png`
  - ranks: `2`-`10`, `jack`, `queen`, `king`, `ace`
  - suits: `clubs`, `diamonds`, `hearts`, `spades`

Example: `ace_of_spades.png`, `10_of_diamonds.png`

## Step 1: Add Asset Folder

Create a new folder under:

- `apps/client/assets/cards/<your-pack-folder>`

Example:

- `apps/client/assets/cards/linen`

Copy all 52 PNG files into that folder.

## Step 2: Add Manifest Entry

Open:

- [packManifest.ts](C:\wamp64\www\poker-champ\apps\client\src\assets\cards\packManifest.ts)

Add a new entry to `CARD_FACE_PACK_MANIFEST`:

```ts
{
  id: "linen",
  label: "Linen Classic",
  source: { type: "local", folder: "linen" },
  previewCardKeys: ["ace_of_spades", "king_of_hearts", "10_of_diamonds", "7_of_clubs"],
}
```

Rules:

- `id` must be unique.
- `source.type` should be `"local"` for bundled packs.
- `source.folder` must match the folder you created.
- `previewCardKeys` should reference valid card keys.

## Step 3: Generate Runtime Registry

Run:

```bash
pnpm card:faces:gen
```

This runs:

- [generate-card-face-packs.ts](C:\wamp64\www\poker-champ\scripts\generate-card-face-packs.ts)

It validates:

- folder exists
- exactly 52 expected files
- no missing keys
- no extra unexpected PNG names

It writes:

- [cardPackRegistry.ts](apps/client/src/assets/cards/generated/cardPackRegistry.ts)

## Step 4: Verify In App

Open Theme Picker:

- `Table menu -> Theme -> Card Faces`

Expected:

- new pack appears in the list
- selecting it updates card art
- face-down cards are unaffected

## Step 5: Run Checks

Run:

```bash
pnpm -C apps/client typecheck
pnpm test:client -- src/tests/cardFaceAssets.test.ts src/tests/cardFaceAssets.pack-switch.test.ts
```

## Troubleshooting

- Generator says folder missing:
  - check `source.folder` in manifest.
- Generator says missing files:
  - verify all 52 filenames exactly match required naming.
- Generator says extra files:
  - remove unrelated files from the pack folder (or move them elsewhere).
- Pack shows in picker but cards fallback to glyph:
  - confirm generation ran after manifest/folder changes.

## Notes

- `applyThemePack()` does not override selected card-face pack.
- Invalid stored `cardFacePackId` falls back to `DEFAULT_CARD_FACE_PACK_ID` (currently `"simple"`).
- **Builtin packs** (e.g. `source: { type: "builtin", variant: "simple" }`) are rendered by code, not images; they do not go through the generator or `CARD_FACE_PACKS`. See [SIMPLE_GRAPHICAL_CARD_FACE_TYPE_PROPOSAL.md](../proposals/SIMPLE_GRAPHICAL_CARD_FACE_TYPE_PROPOSAL.md).
- Local packs are bundled by Metro; adding many large packs increases app bundle size.
