# Background color sources (audit)

Audit of every place in app code that sets or computes `backgroundColor` / `background` so we can trace `rgb(242, 242, 242)`.

## Literals that could be rgb(242, 242, 242)

- **`#f2f2f2`** (≡ rgb(242,242,242)) appears **only here**:
  - `apps/client/src/components/domain/slot-machine/src/theme/themes.ts`
    - Theme **"minimal-mono"**: `colors.bg1: "#f2f2f2"`, `gradients.page: ["#e6e6e6", "#f2f2f2"]`
  - No other file in `apps/client/src` contains `242`, `f2f2f2`, or `#f2f2f2`.

- **HSL that would compute to ~rgb(242,242,242)**: `0 0% 95%` (or 94–96% lightness).
  - **Not used** in app/table theme packs: `themePackConfig.ts` has no `0 0% 95%`.
  - Zen pack has `"0 0% 80%"` (accent) → ~rgb(204,204,204), not 242.

## Where we set background (by component/layer)

### 1. App / page root

- **AppPageRoot** (`AppPageRoot.tsx`): applies resolved app background to `.app-page` (inline style from `resolvedToBodyStyle`). No 242; values from preferences + `resolveBackground`.
- **tokens.css / tokens.web.ts**: `html, body { background-color: hsl(var(--c-bg)); }`, `:root { --c-bg: 0 0% 5%; }`. Dark.

### 2. Stack / layout

- **`_layout.tsx`**: `contentStyle: { backgroundColor: "transparent" }` on Stack. We set transparent; the gray div is two levels under `.app-content`, so it may be an inner layer that does not receive this.

### 3. Screen (screen-level Surface)

- **Screen** (`Screen.tsx`): `Surface as={SafeAreaView}` with:
  - `styleId="surface.screen.base"` → className includes **`bg-bg/70`** (uses `var(--c-bg)`).
  - `unsafeStyle={{ backgroundColor: "rgba(0, 0, 0, 0.97)" }}`.
- So the Screen node gets both: Tailwind `bg-bg/70` (token) and inline dark. If the gray div is an **inner** child of SafeAreaView, it might only get the class (or a default), not the inline style.

### 4. Surface registry (classNames only)

- **surface.screen.base**: `flex-1 bg-bg/70 ${SURFACE_SPACING.screenX}`. Uses `--c-bg` (token, dark).
- **surface.app.canvas**: `SURFACE_COLOR.canvas` = `"bg-bg"` → `--c-bg`.
- No literal 242 or 95% in registry.

### 5. Preferences / theme (calculated)

- **preferences.store**: `backgroundColor` (HSL string) from theme packs via `legacyFromApp` / `applyThemePack`. All pack backgrounds in `themePackConfig.ts` are dark (e.g. `0 0% 5%`, `70 8% 15%`). No 95% lightness.
- **TableSceneShell**: `vars({ "--c-bg": backgroundColor })` — only affects table subtree; value is from store (dark).

### 6. Other components (explicit styles)

- **ThemePickerSheet**: `hsl(${pack.colors[0]})`, `hsl(${p.value})`, fixed `hsl(0 0% 12%)`. Pack colors are dark; no 95%.
- **background.web / background.native**: `resolved.color` → `hsl(...)` or fallback; resolved from preferences (dark).
- **AppTopNav / ProfileAvatarSection**: `var(--c-panel-elevated, #333)`.
- **Screen**: only `rgba(0, 0, 0, 0.97)` and surface class.

### 7. Lesson route (no Screen wrapper)

- **`app/lesson/[lessonId].tsx`**: `<SafeAreaView className="flex-1 bg-bg">` — uses `--c-bg` only (dark in tokens).

## Conclusion

- **We do not set or calculate `rgb(242, 242, 242)` anywhere** except in the slot-machine **minimal-mono** theme (`bg1`, `gradients.page`). Nothing in the main app or table flow uses that theme for a screen/stack background.
- The gray div two levels under `.app-content` has `r-position-*` classes (position + insets), so it is almost certainly an **inner view from SafeAreaView or the Stack/screen stack**. Our `contentStyle` and Screen `unsafeStyle` may apply to a different node; the one you see may be getting:
  - a **default from react-native-safe-area-context or react-native-screens** (not in our repo), or
  - **Tailwind/NativeWind** resolving `bg-bg/70` with a **different `--c-bg`** in that subtree (we don’t set a light `--c-bg` there), or
  - a **build-time or runtime default** from the styling pipeline.

**Next step:** In the browser, inspect the gray div and check the **Computed** panel: which **rule** (file + selector) sets `background-color`? If it’s a class like `r-*` or `css-*`, the value is coming from compiled styles (our StyleSheet or a dependency). If it’s from a `style` attribute, the value is set in JS (our code or a dependency). That will tell us whether to fix it in our code or in a dependency/override.
