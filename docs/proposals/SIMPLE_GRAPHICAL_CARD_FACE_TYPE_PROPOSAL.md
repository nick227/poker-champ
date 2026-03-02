# Simple Graphical Card Face Type — Proposal

**Status: Implemented.** Default card face is "Simple" (builtin); users can switch to "Royal Casino" (image pack) or back via Theme → Card Faces. See `packManifest.ts`, `packs.ts`, `BuiltinCardFace.tsx`, `PlayingCard.tsx`, `ThemePickerSheet.tsx`, `cardFaceAssets.ts`, and tests in `cardFaceAssets.test.ts`.

---

## Goal

Add a new **graphical** card face type: simple, dynamically generated faces with **large readable ranks and suits**, and make it the **default** site card face. Integrate with the existing card system using minimal code churn and a design that stays flexible and extendable.

---

## Current System (Summary)

- **Rendering**: `PlayingCard` either shows an `<Image>` from a pack (via `getCardFaceSource(rank, suit, packId)`) or falls back to an inline **glyph** view (small `Text` rank + suit).
- **Packs**: Image packs are 52 PNGs per pack. Manifest (`packManifest.ts`) lists packs; generator (`generate-card-face-packs.ts`) validates local folders and emits `cardFacePackRegistry.ts` with `CARD_FACE_PACKS` and `CardFacePackId`.
- **Lookup**: `cardFaceAssets.getCardFaceSource(rank, suit, packId)` maps rank/suit → `CardFaceKey` → image from `CARD_FACE_PACKS[packId]`. Returns `null` on invalid/missing.
- **Theme**: Theme picker shows only `source.type === "local"` packs and uses `CARD_FACE_PACKS[packId]` for preview images. Preferences store `cardFacePackId`; `getValidCardFacePackId` falls back to `DEFAULT_CARD_FACE_PACK_ID` ("default").
- **Generator**: Only processes local packs; requires a local pack with id `"default"`. Emits `CardFacePackId` union and hardcodes `DEFAULT_CARD_FACE_PACK_ID = "default"`.

---

## Dynamic vs Prerender

| Aspect | Dynamic (recommended) | Prerender (52 assets) |
|--------|------------------------|------------------------|
| **Assets** | None; render rank/suit in React. | 52 PNG/SVG files or build-step output. |
| **Bundle** | No extra weight. | +52 assets per “simple” variant. |
| **Theming** | Trivial (CSS/tokens, card-face color). | Need to regenerate or support overlays. |
| **Code path** | One new branch in `PlayingCard` + one small component. | Reuses image path; generator or new script to produce assets. |
| **Extensibility** | Add more builtin variants (e.g. "minimal", "large-suit") as renderers. | Each variant = new pack folder + generator run. |
| **Default** | Change default to builtin id; no asset pipeline change. | Either new default pack or replace current "default" assets. |

**Recommendation: dynamic.** No asset pipeline, no generator changes for this pack, smallest churn, and easy to add more builtin “graphical” styles later (e.g. "simple", "minimal", "large-suit").

---

## Proposed Design: Builtin Renderer Pack

Introduce a **builtin** pack type that has **no images** and is rendered by a dedicated React component.

- **New pack id**: `"simple"` — simple graphical face (large rank + suit).
- **New default**: `DEFAULT_CARD_FACE_PACK_ID = "simple"` (new users get simple faces; existing users keep persisted `cardFacePackId`, e.g. "default").
- **Manifest**: Extend source type with `{ type: "builtin"; variant: "simple" }` and add one manifest entry for "simple". Expose **one source of truth** for pack metadata so callers never branch on raw pack id strings.
- **Registry**: Generator stays as-is (only local packs). Pack id type is extended in `packs.ts` to include builtin ids; validation and default live in `packs.ts`.
- **Rendering**: `PlayingCard` uses `getCardFacePackById(packId)`; if `pack.source.type === "builtin"`, render builtin (e.g. `SimpleCardFace` for `pack.source.variant`). Otherwise use image path. No `packId === "simple"` checks in components.
- **Preview**: Theme picker shows all manifest entries (local + builtin); for builtin packs, preview uses the **same** `SimpleCardFace` component (4 small cards) — no simulated or duplicate layout.

This keeps image packs and the generator unchanged; only the client type and render branches grow. It also sets up a **renderer-driven** path alongside the existing **data-driven** (image) path, without encoding builtin logic in multiple places.

---

## Centralized Pack Lookup (Avoid String Checks Everywhere)

**Do not** branch on `packId === "simple"` in multiple files. Use manifest as the single source of truth:

- In **packManifest.ts**, define the manifest entry type with a discriminated source:

```ts
type CardFacePackManifestEntry = {
  id: string;
  label: string;
  source:
    | { type: "local"; folder: string }
    | { type: "builtin"; variant: "simple" };
  previewCardKeys: readonly CardFaceKey[];
};
```

- Expose a getter used by all consumers:

```ts
export function getCardFacePackById(id: CardFacePackId): CardFacePackManifestEntry | undefined
```

- **PlayingCard** then does **not** check `"simple"`. It does:

```ts
const pack = getCardFacePackById(packId);
if (pack?.source.type === "builtin") {
  return <BuiltinCardFace variant={pack.source.variant} rank={rank} suit={suit} />;
}
const imageSource = getCardFaceSource(rank, suit, packId);
// ... existing Image / glyph branches
```

- **getCardFaceSource** is **not** called for builtin packs. It only handles local (image) packs. Builtin packs never go through image lookup — cleaner separation.

This scales when adding `"minimal"` or `"large-suit"`: add variant to the type and one branch in `BuiltinCardFace` (or a small router).

---

## Minimal Code Churn Checklist

1. **Manifest** (`packManifest.ts`)
   - Extend `CardFacePackSource`: `| { type: "builtin"; variant: "simple" }`.
   - Type `CardFacePackManifestEntry` with `previewCardKeys: readonly CardFaceKey[]` (import `CardFaceKey` from packs).
   - Add entry: `{ id: "simple", label: "Simple", source: { type: "builtin", variant: "simple" }, previewCardKeys: [...] }`.
   - Export `getCardFacePackById(id: CardFacePackId): CardFacePackManifestEntry | undefined` (lookup in `CARD_FACE_PACK_MANIFEST`; valid id only).

2. **Pack ID and default** (`packs.ts`)
   - Define `BUILTIN_CARD_FACE_PACK_IDS = ["simple"] as const`.
   - Export `CardFacePackId = CardFacePackIdFromRegistry | (typeof BUILTIN_CARD_FACE_PACK_IDS)[number]`.
   - Export `DEFAULT_CARD_FACE_PACK_ID: CardFacePackId = "simple"`.
   - `isCardFacePackId(v)`: builtin id or `Object.prototype.hasOwnProperty.call(CARD_FACE_PACKS, v)`.
   - `getValidCardFacePackId(v)`: return valid id or `DEFAULT_CARD_FACE_PACK_ID`. **Verify**: `getValidCardFacePackId(undefined)` returns `"simple"`, not `"default"`.

3. **Lookup** (`cardFaceAssets.ts`)
   - **Do not** add a builtin branch in `getCardFaceSource`. Callers that use builtin packs never call it. If desired, `getCardFaceSource` can assume it is only called for image packs (and assert or guard for non-builtin id when called from `PlayingCard` after the builtin branch).

4. **Rendering** (`PlayingCard.tsx`)
   - First: `const pack = getCardFacePackById(packId); if (pack?.source.type === "builtin") return <BuiltinCardFace variant={pack.source.variant} rank={...} suit={...} />;`
   - Then: `const imageSource = getCardFaceSource(rank, suit, packId);` and existing Image / glyph branches.
   - Use same memoization pattern as today; no extra re-renders. Dynamic `<Text>` + layout is cheaper than `<Image>`, so no performance concern.

5. **New component** (e.g. `SimpleCardFace.tsx` or `BuiltinCardFace.tsx` routing by variant)
   - For variant `"simple"`: large rank + suit, theme-aware. **Typography**: use theme tokens for suit color (e.g. danger/success or semantic red), not hardcoded `#dc2626` or `text-red-500`. Rank alignment and dimensions should match card art proportions where possible. Single responsibility; keep file short.

6. **Theme picker** (`ThemePickerSheet.tsx`)
   - Use full manifest for card face options (include builtin).
   - In `renderPackPreview`: get pack via `getCardFacePackById(packId)`; when `pack.source.type === "builtin"`, render 4 small instances of the **same** `SimpleCardFace` (or `BuiltinCardFace`) used on the table — no duplicate or simulated layout.

7. **Generator**
   - No change. Still only processes local packs; still requires a local "default" pack. Builtin packs are not in `CARD_FACE_PACKS`.

8. **Tests**
   - `isCardFacePackId("simple")` returns `true`.
   - `getValidCardFacePackId("simple")` === `"simple"`; `getValidCardFacePackId("unknown")` === `"simple"` (default); `getValidCardFacePackId(undefined)` === `"simple"`.
   - **Audit**: no test should assert fallback to `"default"`; update any that do to expect `DEFAULT_CARD_FACE_PACK_ID` or `"simple"`.
   - Rendering: `PlayingCard` with `packId="simple"` does **not** render `<Image>` (e.g. shallow render and assert no Image for builtin).

---

## Extension Points

- **More builtin variants**: Add `{ type: "builtin"; variant: "minimal" }` (or `"large-suit"`, `"high-contrast"`, `"four-color"`) and a new manifest entry; extend `BuiltinCardFace` (or a small router) to pick component by `pack.source.variant`. No generator changes, no 52-image packs, no bundle growth.
- **Theme-driven builtin**: Use `bg-card-face` and semantic tokens (e.g. danger for red suits); future variants share the same theme surface.
- **Image packs unchanged**: New image packs still follow ADDING_CARD_FACE_PACKS.md; generator and registry format stay the same.
- **Remote packs**: Unaffected; when remote packs exist, builtin remains a separate branch (no image URL).

---

## Default and Migration

- **New users**: Default `cardFacePackId` is "simple" (set via `DEFAULT_CARD_FACE_PACK_ID` in store initial state and in `getValidCardFacePackId` fallback).
- **Existing users**: Persisted `cardFacePackId` (e.g. "default") remains valid; they keep Royal Casino images until they switch to "Simple" in the theme picker.
- No data migration; only the default constant and the set of valid pack ids change.
- **Verification**: Ensure `getValidCardFacePackId(undefined)` and `getValidCardFacePackId("unknown")` return `"simple"`. Audit tests: no assertion that fallback is `"default"`; update to expect `DEFAULT_CARD_FACE_PACK_ID` or `"simple"`.

---

## Typography and Theme Consistency

- **Suit color**: Use semantic theme tokens (e.g. `text-danger` or your theme’s red) for hearts/diamonds, not hardcoded `#dc2626` or `text-red-500`. Matches existing image-pack semantics.
- **Rank alignment**: Match card art dimensions and proportions so the simple face feels consistent with other packs.
- **Contrast**: Ensure suit/rank contrast against `bg-card-face` (and theme tokens) so readability matches or exceeds the current glyph fallback.

---

## UX Notes

- **Preview grid**: Use the **same** `SimpleCardFace` / `BuiltinCardFace` component in the theme picker as on the table — no simulated `<Text>` preview that diverges from real layout.
- **Optional v2 upgrade**: Card corner layout (top-left small rank/suit, bottom-right rotated) can improve readability and polish; keep v1 to large center rank + suit if speed matters.

---

## Edge Case: Removed Builtin

If a builtin (e.g. `"simple"`) is ever removed from the manifest and a user had it selected, `getValidCardFacePackId(persistedId)` must fallback to `DEFAULT_CARD_FACE_PACK_ID`. The union and `isCardFacePackId` / `getValidCardFacePackId` implementation handle this as long as the valid id set is derived from manifest + registry (e.g. `BUILTIN_CARD_FACE_PACK_IDS` is updated when a builtin is removed). Document that removing a builtin requires updating that list and the default if the removed id was the default.

---

## File Summary

| File | Change |
|------|--------|
| `packManifest.ts` | New source type + "simple" entry; `getCardFacePackById(id)`; typed `previewCardKeys` with `CardFaceKey`. |
| `packs.ts` | Builtin id union, `DEFAULT_CARD_FACE_PACK_ID = "simple"`, updated `isCardFacePackId` / `getValidCardFacePackId`. |
| `cardFaceAssets.ts` | No builtin branch; `getCardFaceSource` only used for image packs (called after builtin branch in PlayingCard). |
| `PlayingCard.tsx` | First branch: `getCardFacePackById` → if builtin, render `BuiltinCardFace`; else `getCardFaceSource` + Image/glyph. |
| `SimpleCardFace.tsx` / `BuiltinCardFace.tsx` | New: variant-based builtin renderer; theme tokens for suit color; large rank + suit. |
| `ThemePickerSheet.tsx` | All manifest entries; builtin preview via same `BuiltinCardFace` component. |
| `preferences.store.ts` | No logic change; uses exported `DEFAULT_CARD_FACE_PACK_ID`. |
| `generate-card-face-packs.ts` | No change. |
| `cardFacePackRegistry.ts` | No change (generated; only local packs). |

---

## Strategic Note: Two Categories

The system is moving from a single **image-pack–driven** path to two categories:

- **Data-driven**: image packs (52 assets, registry, `getCardFaceSource`).
- **Code-driven**: builtin renderers (manifest entry, `getCardFacePackById`, `BuiltinCardFace` by variant).

Both are selected by the same `cardFacePackId` and theme picker. This keeps the model simple and gives long-term flexibility without over- or under-engineering.

---

## Outcome

- **New default**: Simple, readable graphical card face (large rank + suit), no assets.
- **Minimal churn**: One new component, centralized pack lookup, no builtin string checks in multiple places.
- **Flexible**: More builtin variants via manifest + variant router; image packs and generator unchanged.
- **Prerender not required**: Dynamic rendering is sufficient and theme-friendly.
- **Tests**: `isCardFacePackId("simple")`, fallback to `"simple"`, and PlayingCard with builtin does not render `<Image>`.
