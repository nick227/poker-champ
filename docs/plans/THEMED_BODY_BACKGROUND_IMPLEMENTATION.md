# Themed Body Background – Implementation Task List

Add body/root background theming (images, gradients, colors) via **one generic surface background system** with two consumers: **felt** and **app-background**. Same `SurfaceBackground` shape, same exclusivity helpers, same resolver. No “felt logic copied for body.”

---

## Architecture: One Surface Background System

**Mental model:**

```
theme pack config
  → background?: SurfaceBackground   (app)
  → felt?: SurfaceBackground        (table)

preferences store
  → appBackground: SurfaceBackground
  → feltBackground: SurfaceBackground
  → setAppBackgroundColor / setAppBackgroundImageId / setAppBackgroundGradient / clearAppBackground
  → setFeltBackgroundColor / setFeltBackgroundImageId / setFeltBackgroundGradient / clearFeltBackground

shared background system (theme/backgrounds/)
  → resolve(surface, consumer) → ResolvedBackground (normalized metadata)
  → web adapter → CSS
  → native adapter → View / ImageBackground props

consumers (dumb)
  → ApplyAppBackground
  → FeltBackground
```

**Boundary to protect:**

- **Helpers** own exclusivity.
- **Resolver** owns meaning (what “color vs image vs gradient vs none” means).
- **Adapters** own platform output (CSS vs RN props).
- **Consumers** stay dumb (subscribe, apply; no theme or resolution logic inside them).

If you keep that boundary, the feature stays clean instead of turning into “felt background logic plus body hacks.”

---

## 1. Store shape (tight)

Prefer structured surfaces over loose top-level fields. **Target shape** (even if legacy felt fields exist temporarily for migration):

```ts
type SurfaceBackground = {
  color: string | null;       // HSL; null = use default token
  imageId: BackgroundImageId | null;
  gradient: FeltGradient | null;
};

type PreferencesState = {
  appBackground: SurfaceBackground;
  feltBackground: SurfaceBackground;
  // ... other prefs
};
```

- **Image id:** `BackgroundImageId` in code; alias to `FeltImageId` for v1 (same assets).
- If you keep legacy felt fields during migration, the **target** is still this shape; migrate as soon as store and applyThemePack are updated.

---

## 2. Resolver: consumer mode and resolved model

**Consumer mode** – Resolver accepts a mode so behavior differences are intentional:

```ts
type BackgroundConsumer = "app" | "felt";
```

- **app** image ⇒ **stretch** (web `background-size: 100% 100%`, native `resizeMode="stretch"`).
- **felt** image ⇒ **cover**.

That is cleaner than sprinkling booleans around.

**Resolver output = normalized metadata, not raw styles.** Core logic returns a resolved model; adapters turn it into platform output.

```ts
type ResolvedBackground =
  | { kind: "none"; color: string | null }
  | { kind: "color"; color: string }
  | { kind: "gradient"; color: string | null; gradient: FeltGradient }
  | { kind: "image"; color: string | null; imageId: BackgroundImageId; size: "cover" | "stretch" };
```

Then:

- **Web adapter** turns `ResolvedBackground` into CSS (body/#root).
- **Native adapter** turns it into View / ImageBackground props.

Platform code stays out of the core resolver.

---

## 3. Helper names (symmetrical)

Use **exactly parallel** APIs for app and felt:

**App:**

- `setAppBackgroundColor(color)`
- `setAppBackgroundImageId(id)`
- `setAppBackgroundGradient(g)`
- `clearAppBackground()`

**Felt:**

- `setFeltBackgroundColor(color)`
- `setFeltBackgroundImageId(id)`
- `setFeltBackgroundGradient(g)`
- `clearFeltBackground()`

No mixing generic `setBackgroundX` with felt-specific names. Store actions call these; helpers enforce exclusivity (set color ⇒ clear image + gradient; set image ⇒ clear gradient; etc.).

---

## 4. “None” selection state (explicit)

In the picker, **“None” is selected only when:**

```ts
color === null && imageId === null && gradient === null
```

Do **not** infer “none” from a dark fallback color. That keeps UI state honest and avoids magic values.

---

## 5. Theme pack config: both surfaces first-class

```ts
type ThemePackConfig = {
  id: ThemePackId;
  name: string;
  // ... existing
  background?: SurfaceBackground;   // app (body/root)
  felt?: SurfaceBackground;         // table felt
};
```

Then **applyThemePack** becomes mechanical: for each pack, set `appBackground` from `pack.background` (or default) and `feltBackground` from `pack.felt` (or default). No special-case branches per pack; one loop or one map.

**Theme pack variety (recommended):**

- **1** none/default (`color: null`, imageId null, gradient null for at least one surface).
- **2** solid only.
- **2** image.
- **2** gradient.

---

## 6. Migration strategy (define up front)

Because this touches persisted prefs, define migration behavior explicitly:

**Existing users (pre-migration state):**

- **appBackground:**  
  - `appBackground.color` = old `backgroundColor` if present, else default (e.g. token or `"0 0% 5%"`).  
  - `appBackground.imageId` = `null`.  
  - `appBackground.gradient` = `null`.
- **feltBackground:**  
  - If fully migrating felt now: map existing `feltColor` / `feltImageId` / `feltGradient` into `feltBackground: SurfaceBackground`.  
  - If keeping legacy felt fields temporarily: still introduce `feltBackground` in store and migrate from legacy in the same migration step so one code path can assume the new shape.

That avoids odd resets or inconsistent state after release.

---

## 7. Shared module layout

**Location:** `theme/backgrounds/` (app background is app-wide, not table-only).

```
theme/backgrounds/
  background.types.ts    -- SurfaceBackground, BackgroundImageId, BackgroundConsumer, ResolvedBackground
  background.helpers.ts  -- exclusivity: setApp*/setFelt* + clearAppBackground/clearFeltBackground
  background.resolver.ts  -- resolve(surface, consumer) → ResolvedBackground
  background.web.ts       -- ResolvedBackground → CSS (body/#root)
  background.native.ts    -- ResolvedBackground → ViewStyle / ImageBackground props (optional file or inside resolver)
```

- **background.helpers.ts** – exclusivity only; no platform or style logic.
- **background.resolver.ts** – meaning only; returns `ResolvedBackground`; takes `BackgroundConsumer` so `size` is `"cover"` | `"stretch"` by consumer.
- **background.web.ts** – platform adapter; turns resolved model into CSS. Used by ApplyAppBackground on web.

---

## 8. ApplyAppBackground: placement and behavior

- **Placement:** As high as possible (e.g. inside AppShell, wrapping app content). Single root component.
- **Keep it dumb:**
  - Subscribes to `appBackground` from store.
  - **Web:** applies side effects (e.g. `useEffect`) to `document.body` and `#root` using the web adapter (resolved model → CSS). No theme logic inside the component.
  - **Native:** renders a wrapper (or root) that applies the native adapter output (resolved model → View/ImageBackground props).
- No theme logic, no pack-specific branches, no resolution logic inside ApplyAppBackground—only subscribe and apply.

---

## 9. AppShell rule

**AppShell does not decide background visuals.** It only hosts the app background applicator (mounts `ApplyAppBackground`). No hardcoded `#0d0d0d` or `bg-bg` for the root background. That avoids conflicts between tokens, body styles, and local container backgrounds.

---

## 10. ThemePickerSheet – BACKGROUND row and “None”

- New row **above** FELT COLOR. Label: **BACKGROUND**.
- **Order:** None → Color presets → (gradient presets if shipped) → Image presets.
- **None** → `clearAppBackground()`. Selection: **None** is selected only when `appBackground.color === null && appBackground.imageId === null && appBackground.gradient === null`.
- **Color preset** → `setAppBackgroundColor(p.value)`.
- **Image preset** → `setAppBackgroundImageId(p.imageId)`.
- **Gradient presets:** Decide **now** for v1:
  - **Either** ship gradient presets in the BACKGROUND (and FELT) row so users can pick gradients manually,
  - **Or** do not show gradient options in the picker and **document** that “gradients are theme-pack-only for v1”.

Avoid half-finished UX (e.g. packs applying gradients but picker having no way to set or clear them).

---

## 11. Refactor FeltBackground to shared resolver

- FeltBackground reads `feltBackground` from store and calls the **same** resolver with `consumer: "felt"`.
- Uses **native adapter** (or shared style builder from resolved model) to get View/ImageBackground props. No local gradient or image logic; resolver + adapters own it.

---

## 12. Implementation order

Get the model stable before touching UI.

1. **background.types.ts** – `SurfaceBackground`, `BackgroundImageId`, `BackgroundConsumer`, `ResolvedBackground`.
2. **background.helpers.ts** – setApp* / setFelt* + clearApp* / clearFelt*; exclusivity only.
3. **background.resolver.ts** – `resolve(surface, consumer)` → `ResolvedBackground`.
4. **Store migration + actions** – `appBackground`, `feltBackground`; migration from old `backgroundColor` and felt fields; actions call helpers.
5. **Theme pack config** – `background?`, `felt?` on `ThemePackConfig`; applyThemePack mechanical.
6. **ApplyAppBackground** – subscribe to `appBackground`; web side effects, native wrapper; use resolver + web/native adapter.
7. **Refactor FeltBackground** – use resolver with `consumer: "felt"`; remove duplicate logic.
8. **Picker row** – BACKGROUND row; None (explicit selection state); color/image/(gradient if decided); symmetrical setApp*.
9. **AppShell cleanup** – remove hardcoded background; only host applicator.
10. **Manual verification** – packs, picker, exclusivity, persistence, no regression.

---

## 13. Acceptance criteria (summary)

**Exclusivity and consistency:**

- Setting background **color** clears image and gradient. Setting **image** clears gradient. Setting **gradient** clears image.
- Felt and app background use the **same** exclusivity rules and **same** resolver output model (`ResolvedBackground`).

**None and selection:**

- “None” is `clearAppBackground()` / `clearFeltBackground()`; resolver fallback to default token. In picker, **None** is selected only when `color === null && imageId === null && gradient === null` (no inference from dark color).

**Resolver and adapters:**

- App image ⇒ stretch; felt image ⇒ cover; behavior driven by `BackgroundConsumer` in resolver.
- Resolver returns **resolved model** only; web adapter → CSS; native adapter → View/ImageBackground props. Platform code out of core logic.

**Store and packs:**

- Target store shape: `appBackground: SurfaceBackground`, `feltBackground: SurfaceBackground`. Theme pack: `background?`, `felt?`; applyThemePack mechanical.

**Determinism and cleanup:**

- **Reapplying the same theme pack yields the same `appBackground` and `feltBackground` state every time.**
- **Switching between image, color, gradient, and none never leaves stale background CSS on body or #root.**

**Ownership:**

- AppShell does not decide background visuals; it only hosts the applicator.
- Helpers own exclusivity; resolver owns meaning; adapters own platform output; consumers stay dumb.

---

## File checklist

| File / area | Changes |
|-------------|--------|
| `theme/backgrounds/background.types.ts` | `SurfaceBackground`, `BackgroundImageId`, `BackgroundConsumer`, `ResolvedBackground`. |
| `theme/backgrounds/background.helpers.ts` | setApp* / setFelt* + clearApp* / clearFelt*; exclusivity only. |
| `theme/backgrounds/background.resolver.ts` | `resolve(surface, consumer)` → `ResolvedBackground`. |
| `theme/backgrounds/background.web.ts` | ResolvedBackground → CSS for body/#root. |
| `theme/backgrounds/background.native.ts` (or same as resolver) | ResolvedBackground → ViewStyle / ImageBackground props. |
| `config/themePackConfig.ts` | `background?: SurfaceBackground`, `felt?: SurfaceBackground`; all 6 packs; applyThemePack mechanical. |
| `stores/preferences.store.ts` | `appBackground`, `feltBackground`; migration from old backgroundColor + felt; actions = setApp* / setFelt* / clear*. |
| New: `ApplyAppBackground` | Dumb: subscribe appBackground; web side effects; native wrapper; no theme logic. |
| `ThemePickerSheet.tsx` | BACKGROUND row; None selected only when all null; symmetrical setApp*; gradient decision documented or shipped. |
| `board-area/FeltBackground.tsx` | Use resolver with consumer `"felt"`; remove local gradient/image logic. |
| `AppShell.tsx` | Remove hardcoded background; only host `ApplyAppBackground`. |

---

## Testing / manual checks

- Apply each of the 6 theme packs; confirm app and felt backgrounds match pack; **reapply same pack → same state**.
- BACKGROUND row: None, color, image (and gradient if shipped); **None selected only when color/imageId/gradient all null**; switching modes **never leaves stale CSS** on body/#root.
- FELT row: same exclusivity and selection behavior; no regression.
- Web: body and #root get same background; app image stretched (100% 100%); felt image cover.
- Native: root View and stretch/cover as specified.
- Persist, reload; both surfaces restored.
- Migration: existing users get appBackground.color from old backgroundColor; no odd resets.
