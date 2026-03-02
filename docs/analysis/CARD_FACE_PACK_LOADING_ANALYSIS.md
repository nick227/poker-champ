# Card Face Pack Loading Analysis And Implementation Proposal

## Scope

- Review current client card-face loading and theme integration.
- Propose a scalable design for adding many card-face packs.
- Enforce strict separation between pack metadata manifest and runtime registry.

## Current System Summary

- Card-face image lookup uses rank/suit to key conversion in [cardFaceAssets.ts](C:\wamp64\www\poker-champ\apps\client\src\components\domain\table\cardFaceAssets.ts:32) and [cardFaceAssets.ts](C:\wamp64\www\poker-champ\apps\client\src\components\domain\table\cardFaceAssets.ts:58).
- Pack data is hardcoded as one `default` pack with 52 static `require(...)` entries in [packs.ts](C:\wamp64\www\poker-champ\apps\client\src\assets\cards\packs.ts:121).
- `PlayingCard` forces image mode via constant in [PlayingCard.tsx](C:\wamp64\www\poker-champ\apps\client\src\components\domain\table\PlayingCard.tsx:58), with glyph fallback on missing image/error.
- Theme picker has no card-face pack selector in [ThemePickerSheet.tsx](C:\wamp64\www\poker-champ\apps\client\src\components\domain\table\ThemePickerSheet.tsx:49).
- Preferences persist in [preferences.store.ts](C:\wamp64\www\poker-champ\apps\client\src\stores\preferences.store.ts:38), but no `cardFacePackId` exists yet.

## Review Findings

| Priority | Issue | Location |
|---|---|---|
| P1 | Pack registry does not scale: each new pack requires another 52 manual `require` lines. | [packs.ts](C:\wamp64\www\poker-champ\apps\client\src\assets\cards\packs.ts:5) |
| P1 | Card-face pack is not user-driven: no persisted pack preference and no picker UI. | [preferences.store.ts](C:\wamp64\www\poker-champ\apps\client\src\stores\preferences.store.ts:12), [ThemePickerSheet.tsx](C:\wamp64\www\poker-champ\apps\client\src\components\domain\table\ThemePickerSheet.tsx:49) |
| P1 | Bundle-size growth risk is unbounded if many local packs are added (all local assets bundled by Metro). | [packs.ts](C:\wamp64\www\poker-champ\apps\client\src\assets\cards\packs.ts:5) |
| P2 | `PlayingCard` subscribes directly to preferences; card-pack selection should be passed from parent to avoid broad subscriptions in realtime render paths. | [PlayingCard.tsx](C:\wamp64\www\poker-champ\apps\client\src\components\domain\table\PlayingCard.tsx:40) |
| P2 | Theme-level `cardFaceColor` semantics are legacy when image cards are primary. | [TableSceneShell.tsx](C:\wamp64\www\poker-champ\apps\client\src\components\domain\table\shell\TableSceneShell.tsx:74), [PlayingCard.tsx](C:\wamp64\www\poker-champ\apps\client\src\components\domain\table\PlayingCard.tsx:64) |

## Design Goals

- Add new packs via one small metadata list.
- Keep Metro-safe static requires for local packs.
- Keep manifest metadata-only and generated registry runtime-only.
- Persist user-selected pack safely.
- Keep card art selection independent from table theme packs.
- Prepare for future remote/on-demand packs without refactoring public types.

## Proposed Architecture

## 1) Strict Manifest And Registry Separation

Manifest file is metadata-only:

- `apps/client/src/assets/cards/packManifest.ts`

```ts
export type CardFacePackSource =
  | { type: "local"; folder: string }
  | { type: "remote"; baseUrl: string };

export const CARD_FACE_PACK_MANIFEST = [
  {
    id: "default",
    label: "Royal Casino",
    source: { type: "local", folder: "default" },
    previewCardKeys: ["ace_of_spades", "king_of_hearts", "10_of_diamonds", "7_of_clubs"],
  },
] as const;
```

Generated registry is runtime-only and contains no UI/manifest metadata:

- `apps/client/src/assets/cards/generated/cardFacePackRegistry.ts`

```ts
export type CardFacePackId = "default" | "linen" | "neon";

export const CARD_FACE_PACKS: Record<
  CardFacePackId,
  Record<CardFaceKey, ImageSourcePropType>
>;
```

## 2) Generator Responsibilities

Add `scripts/generate-card-face-packs.mjs`:

- Read manifest metadata + local folders.
- Validate each local pack has exactly 52 expected keys.
- Fail with explicit missing/extra key reports.
- Emit:
  - `CardFacePackId` union
  - `CARD_FACE_PACKS` static require map
  - `DEFAULT_CARD_FACE_PACK_ID`
- Keep generated file free of labels/previews/source metadata.

## 3) Types And Key Integrity

Define strict card-key typing:

- `Rank = "A" | "K" | "Q" | "J" | "T" | "9" ... "2"`
- `Suit = "s" | "h" | "d" | "c"`
- `CardFaceKey` union for `"ace_of_spades"` style keys.
- `keyFrom(rank: Rank, suit: Suit): CardFaceKey`

Do not use freeform key strings in runtime lookups.

## 4) Preferences Safety Contract

Store additions:

- `cardFacePackId: CardFacePackId`
- `setCardFacePackId(id: CardFacePackId): void`

Safety helper:

- `getValidCardFacePackId(input: unknown): CardFacePackId`
  - if persisted id exists in registry, return it
  - otherwise fallback to `DEFAULT_CARD_FACE_PACK_ID`

`PlayingCard` must not trust persisted values directly.

## 5) Realtime Rendering Optimization

Do not let every `PlayingCard` subscribe to the preferences store.

Use a top-level selector in table scene and pass pack id as prop:

```tsx
const cardFacePackId = usePreferencesStore((s) => s.cardFacePackId);
<PlayingCard packId={cardFacePackId} ... />
```

This limits re-renders from unrelated preference updates in realtime UI.

## 6) Theme Picker Integration

In [ThemePickerSheet.tsx](C:\wamp64\www\poker-champ\apps\client\src\components\domain\table\ThemePickerSheet.tsx):

- Add "Card Faces" section.
- Render selectable packs from manifest metadata.
- Preview with small 4-card grid: `A spade`, `K heart`, `10 diamond`, `7 club`.
- Persist on select via `setCardFacePackId`.

Rule: `applyThemePack()` must never override `cardFacePackId`.

## 7) Bundle-Size Strategy

Current local-pack approach is fine for small counts.

- Good for initial range: about 2 to 4 packs.
- Risk grows materially with many high-resolution packs (10+ packs).

Future path (v2):

- Support remote packs with `{ type: "remote"; baseUrl }` in manifest.
- Load via `Image` URI source.
- Add local caching layer (`expo-file-system`) and cache invalidation policy.

No remote implementation is required for v1, but manifest type should support it now.

## Implementation Plan

1. Add metadata-only manifest (`packManifest.ts`) with source union type.
2. Add generator script for runtime registry emission and strict pack validation.
3. Replace manual `packs.ts` map with generated export surface.
4. Add strict rank/suit/key utilities (`keyFrom`, typed unions).
5. Extend preferences store with safe `cardFacePackId` handling and fallback validation.
6. Pass `packId` from scene-level component into `PlayingCard` as prop.
7. Add card-face pack section to theme picker with 4-card preview grid.
8. Ensure `applyThemePack` does not modify `cardFacePackId`.

## Test Matrix

- Generator and integrity:
  - valid pack emits 52 keys
  - missing file fails generation
  - extra file fails generation
  - id/type emission matches manifest entries
- Store safety:
  - invalid persisted pack id resolves to default
  - valid persisted id remains stable
- Rendering:
  - selected pack changes face source
  - image load error falls back to glyph
- Realtime behavior:
  - hot swap pack mid-hand causes no crash
  - no infinite re-render loop on pack change
  - snapshot/game state remains unchanged

## Dev-Only Runtime Validator

Add dev-only pack assertion on boot:

```ts
if (__DEV__) {
  assertPackIntegrity(CARD_FACE_PACKS);
}
```

Checks:

- exactly 52 keys per pack
- all keys are valid `CardFaceKey`
- no missing keys

This catches generator drift early during development.

## Theme Semantics

- Theme pack controls: felt, rails/background, accents, card back.
- Card-face art pack is user identity/customization and independent.
- Never reset user-selected card-face pack when switching visual themes.

## Outcome

v1 remains Metro-safe and easy to operate:

- add pack folder
- add one manifest entry
- run generator
- pack appears in picker and persists

v2 path is preserved for remote/on-demand packs without breaking model types.
