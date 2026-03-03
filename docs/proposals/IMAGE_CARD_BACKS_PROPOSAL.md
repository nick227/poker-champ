# Image Graphic Card Backs — Proposal

## Goal

Support **image-based card backs** (PNG assets) alongside existing procedural patterns, reusing the same manifest → validate → generate → runtime lookup flow used for card faces. One image-handling pipeline; minimal code churn.

## Constraints

- **Single image pipeline**: No second build step, no separate image-loading logic. Extend the existing card-face generator and registry pattern.
- **Minimal churn**: Prefer extending current scripts and types over new subsystems.
- **Backward compatibility**: Existing procedural backs and preferences remain; image backs are additive.

---

## Current State (Reused Pieces)

### Card faces (image path)

| Layer | Location | Role |
|-------|----------|------|
| Manifest | `packManifest.ts` → `CARD_FACE_PACK_MANIFEST` | id, label, source (local/builtin/remote), previewCardKeys |
| Assets | `apps/client/assets/cards/<folder>/` | 52 PNGs: `<rank>_of_<suit>.png` |
| Build | `pnpm card:faces:gen` → `scripts/generate-card-face-packs.ts` | Validates 52 files per local pack; writes `cardFacePackRegistry.ts` with `require()` per file |
| Registry | `generated/cardFacePackRegistry.ts` | `CARD_FACE_PACKS: Record<CardFacePackId, CardFacePack>`, `CardFacePack = Record<CardFaceKey, ImageSourcePropType>` |
| Runtime | `cardFaceAssets.ts` → `getCardFaceSource(rank, suit, packId)` | Returns `ImageSourcePropType \| null` from registry |
| UI | `ThemePickerSheet` + `PlayingCard` | Manifest drives picker; face-down uses `CardBack` (procedural only) |

### Card backs (current)

- **Procedural only**: `CardBackPatterns.tsx` (classic, geometric, ornate, minimal, gradient) + HSL from `preferences.store`.
- **Store**: `cardBackPattern`, `cardBackHue`, `cardBackSaturation`, `cardBackLightness`.
- **Rendering**: `PlayingCard` face-down → `CardBack` → `CardBackPattern` with store values.

---

## Proposed Design

### 1. One generator, one or two registry outputs

**Keep a single script and command** (no renames):

- **Script**: `scripts/generate-card-face-packs.ts` — unchanged name.
- **Command**: `pnpm card:faces:gen` — unchanged. Internally the script generates both face and back registries.

No new npm script, no doc/CI churn, no muscle-memory break.

**Output option A (recommended)** — one generated file:

- Write a single file **`generated/cardPackRegistry.ts`** that exports:
  - `CARD_FACE_PACKS`, `CardFacePackId`, `CardFaceKey`, `CardFacePack` (existing shape).
  - `CARD_BACK_PACKS`, `CardBackPackId` (one image per pack).
- One file, one import surface, one image registry. Cleaner mental model.

**Output option B** — two files:

- Keep writing `cardFacePackRegistry.ts` as today and add a second file `cardBackPackRegistry.ts` for backs. Same types and pattern, just two outputs.

Implementation: script reads both manifests, runs both validations, then either (A) emits one combined `cardPackRegistry.ts` and removes/repurposes the old face-only output path, or (B) emits both files. Recommendation: **option A**.

### 2. Manifest extension (same file)

**File**: `apps/client/src/assets/cards/packManifest.ts`

Add types and array:

```ts
// Card back packs: one image per pack (e.g. back.png in folder)
export type CardBackPackSource = { type: "local"; folder: string };

export type CardBackPackManifestEntry = {
  id: string;
  label: string;
  source: CardBackPackSource;
};

export const CARD_BACK_PACK_MANIFEST: readonly CardBackPackManifestEntry[] = [
  { id: "royal", label: "Royal Blue", source: { type: "local", folder: "backs/royal" } },
  // ...
];
```

- No `previewCardKeys`; preview is the single back image.
- Only `local` source for MVP; no builtin back pack in manifest (procedural stays out of this list).

### 3. Asset layout for back packs

- **Path**: `apps/client/assets/cards/backs/<pack-folder>/back.png` (fixed filename).
- **Contract**: Folder must exist and contain `back.png`. **Do not validate “exactly one PNG”** — validate presence only. Ignore extra files (previews, source files, variants). Hard-failing on extra files would create friction for designers.

### 4. Generator changes (same script, same name)

**File**: `scripts/generate-card-face-packs.ts` — **do not rename**.

- Import `CARD_BACK_PACK_MANIFEST`.
- Add `validateLocalBackPacks()`: for each entry with `source.type === "local"`, ensure **folder exists** and **folder contains `back.png`**. Do not fail on extra files; ignore them.
- Add back registry generation (either into combined `cardPackRegistry.ts` or separate `cardBackPackRegistry.ts`): `CARD_BACK_PACKS[packId] = require(".../backs/<folder>/back.png")`, same `isTestEnv` handling.
- In `main()`: run existing face validation + face generation; run back validation + back generation. Command stays **`pnpm card:faces:gen`**; script internally produces both registries.

Result: **one script**, **one command**, one or two output files; same validation (presence-only for backs) and codegen pattern.

### 5. Runtime: single lookup for image backs

**New (or extend)** `apps/client/src/components/domain/table/cardFaceAssets.ts` (or a small `cardBackAssets.ts` that mirrors it):

- Export `getCardBackSource(packId: CardBackPackId): ImageSourcePropType | null` that reads from `CARD_BACK_PACKS` (from generated registry — either `cardPackRegistry.ts` or `cardBackPackRegistry.ts`). Same pattern as `getCardFaceSource` (lookup by id, return source or null).

**Backs module** (e.g. under `packs.ts` or same file as face packs):

- Re-export `CARD_BACK_PACKS`, `CardBackPackId` from the generated registry; provide `isCardBackPackId(value)`, `getValidCardBackPackId(value)` if needed for preferences.

No second image pipeline: same `Image` component, same dimensions from `DEFAULT_CARD_DIMENSIONS`, same error handling pattern as face images.

### 6. Preferences and rendering

**Store** (`preferences.store.ts`):

- Add `cardBackPackId: CardBackPackId | null`. Default `null`.
- **Semantics**: `null` = use procedural back (current behavior: `cardBackPattern` + HSL). Non-null = use image back from `CARD_BACK_PACKS[cardBackPackId]`.
- Add `setCardBackPackId(id: CardBackPackId | null)`.
- Theme packs: can set `cardBackPackId` to an image pack id or `null` and set `cardBackPattern` when switching to procedural. No change to existing HSL/procedural state.

**Rendering** (`PlayingCard.tsx` → `CardBack`):

- Read `cardBackPackId` from store.
- If `cardBackPackId !== null` and `getCardBackSource(cardBackPackId)` is non-null: render image back (see **Rendering detail** below).
- Else: render current `<CardBackPattern ... />` with `cardBackPattern` and HSL.

So: **one branch** in `CardBack` (image vs procedural); no duplicate image-loading logic.

**Rendering detail (important)**  
When rendering image backs, use the same pattern as face images:

```tsx
<Image
  source={source}
  style={{ width, height }}
  resizeMode="contain"
/>
```

Use **`resizeMode="contain"`**, not `"cover"`. Back images must respect the card aspect ratio exactly like faces.

### 7. Theme Picker

**Card Back section** in `ThemePickerSheet.tsx`:

- **Procedural options**: Keep current `CARD_BACK_PATTERNS`; on select call `setCardBackPattern(id)` and `setCardBackPackId(null)`.
- **Image options**: Map over `CARD_BACK_PACK_MANIFEST`; preview = `<Image source={getCardBackSource(id)} />` in a small card-sized tile; on select call `setCardBackPackId(id)`.
- Display order: e.g. procedural first, then image packs (or one combined list with a type discriminator). Selection state: highlight when `cardBackPackId === id` (image) or when `cardBackPackId === null && cardBackPattern === id` (procedural).

Single UI surface; no second “image back” screen or flow.

### 8. Adding a new image back (developer flow)

1. Add folder `apps/client/assets/cards/backs/<pack-folder>/` and place `back.png` in it. Extra files (previews, sources, variants) are allowed; generator only requires that `back.png` exists.
2. Add entry to `CARD_BACK_PACK_MANIFEST` in `packManifest.ts` (id, label, source.folder).
3. Run existing generator: `pnpm card:faces:gen` (generates both face and back registries).
4. New back appears in Theme Picker; no change to procedural backs or face packs.

Update **ADDING_CARD_BACKS_AND_FRONTS.md** to document this (and reference the same generator).

---

## Summary Table

| Concern | Card faces (existing) | Card backs (image — proposed) |
|---------|------------------------|---------------------------------|
| Manifest | `CARD_FACE_PACK_MANIFEST` | `CARD_BACK_PACK_MANIFEST` (same file) |
| Assets | `assets/cards/<folder>/` 52 PNGs | `assets/cards/backs/<folder>/back.png` (extra files ignored) |
| Build | `pnpm card:faces:gen` → `generate-card-face-packs.ts` | Same script & command; internally generates both |
| Registry | `cardFacePackRegistry.ts` or combined `cardPackRegistry.ts` | Same file (preferred) or `cardBackPackRegistry.ts` |
| Lookup | `getCardFaceSource(rank, suit, packId)` | `getCardBackSource(packId)` |
| Store | `cardFacePackId` | `cardBackPackId \| null` (+ existing procedural state) |
| Render | `Image` or `BuiltinCardFace` | `Image` (resizeMode="contain") or `CardBackPattern` (one branch in `CardBack`) |

---

## Out of Scope / Later

- Remote back packs (`type: "remote"`, baseUrl): same as faces, can be added later to manifest and generator if needed.
- Multiple images per back pack (e.g. variants): not needed for MVP; one image per pack keeps the pipeline identical to “one key per pack” and avoids a second key type.

---

## Risk Assessment

| Risk | Reality |
|------|---------|
| Generator complexity | Low |
| Bundle size impact | Minimal (1 PNG per pack) |
| Runtime branching | Trivial |
| Theming conflict | None |
| Breaking procedural flow | None |

This is a safe extension.

**Mitigations**: Keep back validation and codegen as a small, parallel block (presence-only for `back.png`). Stale registry: same as faces — CI can run generator and assert no diff; docs state the step.

---

## Final Recommendation

Proceed exactly as proposed with:

- Manifest extension (`CARD_BACK_PACK_MANIFEST`)
- Generator extension (same script name, same `pnpm card:faces:gen`; validate folder exists + `back.png` present; ignore extra files)
- Prefer single generated file `cardPackRegistry.ts` exporting both `CARD_FACE_PACKS` and `CARD_BACK_PACKS` (one import surface)
- `cardBackPackId | null` in store
- Single branch in `CardBack` (image vs procedural)
- Unified Theme Picker (procedural + image options)
- Image back render: `resizeMode="contain"` so aspect ratio matches faces

This keeps the system consistent and scalable. If implemented cleanly, image backs will feel like they were always part of the architecture.

---

## Conclusion

Image card backs are implemented by **reusing the existing face-pack pipeline**: same manifest pattern, same generator (extended to validate presence of `back.png` and emit back registry, optionally combined into one file), same runtime lookup and `Image` rendering with `resizeMode="contain"`. Procedural backs remain as today; the only new surface is `cardBackPackId` and a single branch in `CardBack` and in the Theme Picker. This keeps a single image-handling flow and minimizes code churn.
