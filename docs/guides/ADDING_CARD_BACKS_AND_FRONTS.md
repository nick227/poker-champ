# Adding New Card Backs and Card Fronts

This guide explains how to add new **card backs** (patterns) and **card fronts** (face packs) so they are picked up in the build and offered in the Theme Picker.

---

## Card Fronts (Face Packs)

Card fronts are image-based: 52 PNGs per pack, registered in a manifest and validated/generated at build time.

### Overview

| Step | Action |
|------|--------|
| 1 | Add asset folder with 52 PNGs under `apps/client/assets/cards/<pack-folder>` |
| 2 | Add manifest entry in `packManifest.ts` |
| 3 | Run build step `pnpm card:faces:gen` to generate the registry |
| 4 | New pack appears in Theme Picker under **Card Faces** |

### File contract

- **Location**: `apps/client/assets/cards/<your-pack-folder>/`
- **Naming**: `<rank>_of_<suit>.png`
  - Ranks: `2`–`10`, `jack`, `queen`, `king`, `ace`
  - Suits: `clubs`, `diamonds`, `hearts`, `spades`
- **Example**: `ace_of_spades.png`, `10_of_diamonds.png`

### Manifest entry

Edit `apps/client/src/assets/cards/packManifest.ts`. Add to `CARD_FACE_PACK_MANIFEST`:

```ts
{
  id: "your-pack-id",
  label: "Your Pack Name",
  source: { type: "local", folder: "your-pack-folder" },
  previewCardKeys: ["ace_of_spades", "king_of_hearts", "10_of_diamonds", "7_of_clubs"],
}
```

- `id`: unique; used in preferences and registry.
- `source.folder`: must match the folder name under `assets/cards/`.
- At least one local pack must have `id: "default"`.

### Build step

```bash
pnpm card:faces:gen
```

This script:

- Reads `CARD_FACE_PACK_MANIFEST`
- Validates each local pack: folder exists, exactly 52 expected PNGs, no missing/extra files
- Writes `apps/client/src/assets/cards/generated/cardPackRegistry.ts` (types, `CARD_FACE_PACKS`, and `CARD_BACK_PACKS`)

After generation, the new pack is available in the Theme Picker and via `cardFacePackId` in the preferences store.

### Theming

- **Theme Picker**: Table menu → Theme → **Card Faces**. The list is driven by the manifest + registry; builtin pack `"simple"` is handled separately.
- **Preference**: `cardFacePackId` in `usePreferencesStore`; invalid values fall back to `DEFAULT_CARD_FACE_PACK_ID`.
- Theme packs (`applyThemePack`) do not override the user’s card-face pack choice.

For full detail and troubleshooting, see [ADDING_CARD_FACE_PACKS.md](./ADDING_CARD_FACE_PACKS.md).

---

## Card Backs (Patterns)

Card backs are **procedural** (code-rendered). The list and colors are a **single source of truth** in `cardBackProcedural.ts`; adding a new pattern requires updating that file and adding the render case.

### Overview

| Step | File | Action |
|------|------|--------|
| 1 | `cardBackProcedural.ts` | Add `{ id, name, icon, background, pattern }` to `PROCEDURAL_CARD_BACK_PATTERNS` (HSL strings: `"H S% L%"`) |
| 2 | `CardBackPatterns.tsx` | Add `case "your-pattern":` in the switch; use `backgroundHsl` and `patternHsl` props |
| 3 | `preferences.store.ts` | Optionally set `cardBackPattern: "your-pattern"` in `applyThemePack` for theme presets |

### 1. Single source: procedural manifest

**File**: `apps/client/src/assets/cards/cardBackProcedural.ts`

- Add one entry to `PROCEDURAL_CARD_BACK_PATTERNS` with **background** and **pattern** colors (HSL `"H S% L%"`):

```ts
{ id: "your-pattern", name: "Your Pattern", icon: "◆", background: "217 50% 22%", pattern: "217 50% 35%" },
```

- `CardBackPatternId` is derived from this array; Theme Picker uses it for the list. `setCardBackPattern` also updates `cardBackColor` from the pattern’s background for `--c-card-back`.

### 2. Pattern rendering

**File**: `apps/client/src/components/domain/table/CardBackPatterns.tsx`

- Add a `case "your-pattern":` in the `switch (pattern)` that returns a `<View>` using `backgroundHsl` (base) and `patternHsl` (shapes; lighter/darker are derived in the component). Props are `pattern`, `backgroundHsl`, `patternHsl`, `width`, `height`.

### 3. Theme packs (optional)

**File**: `apps/client/src/stores/preferences.store.ts`

- In `applyThemePack`, set `cardBackPattern: "your-pattern"` for that pack; `cardBackColor` is set from the pattern’s background automatically.

### Theming

- **Theme Picker**: Table menu → Theme → **Card Back Pattern**. Options come from `PROCEDURAL_CARD_BACK_PATTERNS`; selection is `setCardBackPattern(pattern.id)` (which also syncs `cardBackColor`).
- **Preference**: `cardBackPattern` and `cardBackColor` in `usePreferencesStore`. Colors for procedural backs come from the manifest; `cardBackColor` is used for `--c-card-back` (e.g. TableSceneShell).

### Checklist for a new card back pattern

1. [ ] `cardBackProcedural.ts`: add `{ id, name, icon, background, pattern }` to `PROCEDURAL_CARD_BACK_PATTERNS`.
2. [ ] `CardBackPatterns.tsx`: add `case "your-pattern":` with correct rendering using `backgroundHsl` / `patternHsl`.
3. [ ] `preferences.store.ts` (optional): set `cardBackPattern` in `applyThemePack` for relevant theme packs.
4. [ ] Run typecheck and any card/theme tests; confirm the new pattern appears in Theme Picker and renders on the table.

---

## Card Backs (Image Packs)

Image-based card backs use the same build pipeline as face packs: one PNG per pack (`back.png`), manifest entry, and `pnpm card:faces:gen`.

### Overview

| Step | Action |
|------|--------|
| 1 | Add folder `apps/client/assets/cards/backs/<pack-folder>/` with `back.png` (extra files allowed) |
| 2 | Add entry to `CARD_BACK_PACK_MANIFEST` in `packManifest.ts` |
| 3 | Run `pnpm card:faces:gen` (generates both face and back registries) |
| 4 | New back appears in Theme Picker under **Card Back Pattern** (below procedural options) |

### Manifest entry

Edit `apps/client/src/assets/cards/packManifest.ts`. Add to `CARD_BACK_PACK_MANIFEST`:

```ts
{ id: "your-back-id", label: "Your Back", source: { type: "local", folder: "backs/your-back-folder" } }
```

- `source.folder`: path relative to `assets/cards/`; folder must contain `back.png`. Other files are ignored.

### Build step

Same as face packs: `pnpm card:faces:gen`. The generator validates that each back pack folder exists and contains `back.png`, then writes `CARD_BACK_PACKS` into `generated/cardPackRegistry.ts`.

---

## Summary

| | Card fronts | Card backs |
|---|-------------|------------|
| **Source** | 52 PNGs per pack in `assets/cards/<folder>/` | Procedural patterns in `CardBackPatterns.tsx` |
| **Build** | `pnpm card:faces:gen` after manifest/folder changes | None; code-only |
| **Registration** | `packManifest.ts` → generated `cardPackRegistry.ts` | Procedural: `cardBackProcedural.ts` (single source); image: `CARD_BACK_PACK_MANIFEST` + same registry |
| **Theming** | Theme Picker → Card Faces; store `cardFacePackId` | Theme Picker → Card Back Pattern; store `cardBackPattern`; procedural colors from manifest, `cardBackColor` for `--c-card-back` |

Both flows feed into the same Theme Picker and preferences store so new fronts and backs are available in theming immediately after the steps above.
