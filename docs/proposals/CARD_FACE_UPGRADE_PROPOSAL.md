## Card face upgrade (swappable image set)

### Summary

- **Goal**: Allow the client to use a **pluggable set of 52 raster card-face images** (e.g. `2_of_clubs.png`, `jack_of_spades.png`) while keeping the current vector/text-based implementation as a **fallback and alternative style**, and making it **trivial to swap in new art packs** in the future.
- **Scope**: Client-side rendering only; we do **not** change the game engine’s representation of cards (still rank/suit codes like `Ah`, `Td` etc.).
- **MVP**: Add one **“image card face” style** that can be toggled via preferences/feature flag, using a single sprite folder and a simple mapping from rank/suit → filename.
 - **Quality**: Cover the new mapping + rendering strategy with unit tests so card-face packs are safe to refactor.

---

### Requirements

- **Functional**
  - Table UI uses **image-based card faces** when the new style is enabled.
  - It remains possible to **switch back** to the existing text glyph style without code changes (e.g. user preference or config flag).
  - The system supports **multiple art packs** (different PNG sets) with the **same 52-card naming convention**, swappable via configuration.
  - If a given image is missing or fails to load, we **gracefully fall back** to the current text-based rendering for that card.
- **Non-functional**
  - New card faces **respect existing card dimensions** from `cardDimensions.constants.ts` (no layout churn).
  - The mechanism to swap packs is **centralized and declarative** (no scattered imports).
  - Desktop/web bundle size impact is **controlled** and localized (card face assets live under a single folder, easy to audit or lazy-load later).
  - The card-face mapping and rendering behavior is **unit tested** (mapping, normalization, and glyph fallback).

---

### Asset storage layout (Expo / React Native friendly)

#### 1. Base folder for card-face PNGs

- **Location**: keep client art under the Expo app so Metro can bundle it via static `require`:
  - `apps/client/assets/cards/default/*.png`
- Store the 52 front faces as individual files:
  - Example names (you already have):  
    - `2_of_clubs.png`  
    - `jack_of_spades.png`  
    - `ace_of_hearts.png`  
    - `10_of_diamonds.png`
- Naming convention (MVP, aligned with your files):
  - `<rank>_of_<suit>.png`
  - Ranks: `2`–`10`, `jack`, `queen`, `king`, `ace`
  - Suits: `clubs`, `diamonds`, `hearts`, `spades`

Notes:

- Assets are referenced via **static `require` calls** so Metro/Expo can include them in the bundle.
- For future multiple packs, we can nest:
  - `apps/client/assets/cards/default/2_of_clubs.png`
  - `apps/client/assets/cards/hand-drawn/2_of_clubs.png`

---

### Code insertion points (current implementation)

Current card rendering is **purely programmatic** using rank/suit glyphs and a colored back:

- **Front face rendering**: `PlayingCard.tsx`
  - File: `apps/client/src/components/domain/table/PlayingCard.tsx`
  - Current behavior:
    - Uses `rank` / `suit` props and maps them via:
      - `SUITS: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };`
      - `RANKS: Record<string, string> = { A: "A", 2: "2", ..., T: "10", J: "J", Q: "Q", K: "K" };`
    - For face-down cards, renders `<CardBackPattern />` with colors and pattern from `usePreferencesStore`.
    - Uses `DEFAULT_CARD_DIMENSIONS` from `cardDimensions.constants.ts` for width/height.
- **Card back rendering**:
  - `CardBackPatterns.tsx` – procedural backgrounds driven by `CardBackPattern` and HSL values from preferences.
- **Dimensions / sizing**:
  - `cardDimensions.constants.ts` – single source of truth:
    - `BASE_CARD_WIDTH`, `BASE_CARD_HEIGHT`
    - `CARD_SCALES`, `getCardDimensions`, `DEFAULT_CARD_DIMENSIONS`

MVP card-face upgrade should **only touch these areas**, plus a small new helper for mapping rank/suit → image URL.

---

### Proposed design: pluggable card-face renderer (Expo-safe)

#### 1. Card-face strategy in `PlayingCard`

Add a **strategy-like split** inside `PlayingCard`:

- **New concept**: `cardFaceStyle` preference or feature flag:
  - e.g. `"glyph"` (current) vs `"image"` (new).
  - Source: `usePreferencesStore` or a simple config constant in the MVP.
- **Behavior in `PlayingCard`**:
  - For **face-down**:
    - Keep using `<CardBackPattern />` exactly as today (MVP does not change backs).
  - For **face-up**:
    - If `cardFaceStyle === "image"`:
      - Compute an **image URL** from `(rank, suit)` using a shared helper (see below).
      - Render an `<Image>` (React Native / web equivalent) sized by `DEFAULT_CARD_DIMENSIONS` and styled with the same rounded borders as the current card.
      - If the URL is missing/undefined (or load error), fall back to the glyph implementation.
    - Else (glyph mode or fallback):
      - Keep current `Text`-glyph rendering unchanged.

This keeps all card-face style decisions **localized** to `PlayingCard` while reusing sizing and layout.

#### 2. Rank/suit → `ImageSourcePropType` helper

Add a **small, pure mapping helper** in the table domain:

- File: `apps/client/src/components/domain/table/cardFaceAssets.ts`
- Responsibilities:
  - Normalize our internal rank/suit codes (`A`, `K`, `Q`, `J`, `T`, `"2"`, `"3"`, etc.; `s/h/d/c`) into the `<rank>_of_<suit>` key.
  - Look up that key in the active pack’s **static require map**.
  - Provide a single function:
    - `getCardFaceSource(rank?: string, suit?: string, packId?: CardFacePackId): ImageSourcePropType | null`
  - Encapsulate pack selection and fallback:
    - Uses `DEFAULT_CARD_FACE_PACK_ID` when `packId` is not provided.
    - Returns `null` when rank/suit is missing or key is not found in the pack.

This helper keeps Metro-safe `require` usage centralized and lets us swap packs and naming rules in **one place** without touching `PlayingCard`.

---

### Where to plug it in (step-by-step)

#### 1. New helper file: `cardFaceAssets.ts`

- **Location**: `apps/client/src/components/domain/table/cardFaceAssets.ts`
- Exposes:
  - `getCardFaceSource(rank?: string, suit?: string, packId?: CardFacePackId): ImageSourcePropType | null`
- Implementation details (MVP):
  - Map internal ranks:
    - `A` → `ace`, `K` → `king`, `Q` → `queen`, `J` → `jack`, `T` → `10`
    - `2`–`9` stay as-is.
  - Map suits:
    - `s` → `spades`, `h` → `hearts`, `d` → `diamonds`, `c` → `clubs`.
  - Construct key: `${rankName}_of_${suitName}`.
  - Look up `CARD_FACE_PACKS[packId][key]` and return the `require(...)` result or `null`.

#### 2. `PlayingCard.tsx`: choose between glyph and image

- **Insertion point**: `apps/client/src/components/domain/table/PlayingCard.tsx`
  - After we normalize `rank` and `suit`, we:
    - Use a simple `cardFaceStyle: "glyph" | "image"` constant (MVP) inside `PlayingCard` to select the mode.
    - Call `getCardFaceSource(normalizedRank, normalizedSuit)` when `cardFaceStyle === "image"`.
    - If `getCardFaceSource` returns a non-null `ImageSourcePropType`, render an `Image` wrapped in the existing card chrome:
      - Width/height from `DEFAULT_CARD_DIMENSIONS`.
      - Same `rounded-card border border-border-subtle` classes, with `overflow-hidden` so the art is clipped to the card shape.
    - If `getCardFaceSource` returns `null` or the `Image` fires `onError`, fall back to the existing glyph implementation:
      - Use `RANKS` / `SUITS` map and `Text` components as today.

This change is **fully localized** to `PlayingCard` and does not affect any consumer components that already pass `rank`/`suit`.

---

### How to swap card-face packs

MVP should keep swapping simple and centralized:

- **Configuration location**:
  - For MVP, we use a static `DEFAULT_CARD_FACE_PACK_ID` constant in `apps/client/src/assets/cards/packs.ts`.
  - Later, this can evolve into a preference field exposed from `usePreferencesStore` (e.g. `cardFacePack: "default" | "hand-drawn"`).
- **Usage**:
  - `PlayingCard` calls `getCardFaceSource` which uses the default pack id unless another is provided.
- **Changing packs**:
  - To try a different pack:
    - Drop new PNGs under a sibling folder:
      - `apps/client/assets/cards/hand-drawn/2_of_clubs.png`, etc.
    - Add a new entry to `CARD_FACE_PACKS` in `packs.ts` and update `DEFAULT_CARD_FACE_PACK_ID` (or later, wire it into settings).

No other code needs to change as long as the **52 filenames and layout** match the agreed contract.

---

### Future enhancements (out of MVP scope)

- **Multiple resolutions / retina**:
  - Introduce `@2x` / `@3x` assets or WebP variants, wired via the same helper.
- **Themed backs aligned with fronts**:
  - Allow each pack to define a default back pattern or background image to match the front art style.
- **Dynamic theming per table / tournament**:
  - Let certain game modes select a different `cardFacePack` for flavor.
- **Sprite sheets**:
  - Replace 52 separate PNGs with a sprite sheet and mapping to reduce requests; the helper can encapsulate sprite coordinates instead of filenames.

---

### Summary

- **Assets live in**: `apps/client/assets/cards/` (e.g. `apps/client/assets/cards/default/*.png`, optionally `apps/client/assets/cards/<pack>/*.png`).
- **Primary code insertion points**:
  - Front faces: `apps/client/src/components/domain/table/PlayingCard.tsx` (add an image-based branch).
  - Mapping/helper: `apps/client/src/components/domain/table/cardFaceAssets.ts` (new file).
  - Dimensions: continue to rely on `apps/client/src/components/domain/table/constants/cardDimensions.constants.ts` (no change).
- This design makes swapping card-face packs a **one-folder drop-in** plus, at most, a **single configuration change**, while preserving the existing glyph-based style as a robust fallback.

---

### Testing

- **Unit tests added**:
  - `apps/client/src/tests/cardFaceAssets.test.ts`
    - Verifies:
      - `getCardFaceSource` returns `null` when rank or suit is missing.
      - Correct mapping from rank/suit (`"A"`, `"s"`) to a concrete entry in `CARD_FACE_PACKS[DEFAULT_CARD_FACE_PACK_ID]`.
      - Case normalization for rank/suit before lookup.
      - `null` for unsupported suit codes or unknown ranks that do not exist in the pack map.
  - `apps/client/src/tests/PlayingCard.image-face.test.tsx`
    - Uses Vitest + Testing Library with a mocked `getCardFaceSource`:
      - When `getCardFaceSource` returns a source, `PlayingCard` renders a `react-native` `Image`.
      - When `getCardFaceSource` returns `null`, `PlayingCard` renders the original glyph-based card (rank + suit symbols) and no `Image`.

These tests ensure the **pack registry**, **mapping helper**, and **glyph fallback** remain stable as we add or swap card art packs.

