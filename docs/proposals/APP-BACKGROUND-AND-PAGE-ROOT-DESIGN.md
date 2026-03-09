# App background and page root – design plan

## Current problems

1. **Wrong target**: Background is applied to `body` and `#root` via `useLayoutEffect`. Body has `max-width: 640px`, so the background can never be true edge-to-edge.
2. **Redundant application**: Same background is (a) set on body + #root in effect and (b) applied to a wrapper `View` with `main-wrapper` — double application and unclear ownership.
3. **Platform.OS everywhere**: Logic is split by `Platform.OS === "web"` for both “where to apply” and “how to render”; the “where” part (body/root) is the wrong abstraction.
4. **640px on body**: Layout constraint lives on `body` in `tokens.css`, which conflates “full-page chrome” with “content width”. That blocks a real full-viewport background.
5. **Duplicate wrappers**: AppShell has `ApplyAppBackground` → View (main-wrapper) and inside it another View (main-wrapper + bg-red-500), which is redundant and debug-heavy.

## Goal

- **Single, explicit target** for the master edge-to-edge background: one full-viewport container.
- **No DOM mutation** of `html`/`body`/`#root` for background; control is a **property on one element**.
- **Clear layout**: Full-page container (edge-to-edge) → content container (640px) → app content.
- **Robust**: Same contract on web and native (one wrapper gets the background); platform only affects *how* that wrapper is rendered (div + CSS vs View/ImageBackground).

---

## 1. Layout: full-page container + content width in CSS

**Source of truth: `tokens.css`** (then run `sync-tokens-web.cjs` so `tokens.web.ts` stays in sync).

- **`html, body`**: Full viewport only — `width: 100%`, `height: 100%`, `margin: 0`. Remove `max-width: 640px` and `overflow: hidden` from `body`.
- **`#root`**: Full viewport flex — `display: flex`, `flex: 1`, `min-height: 100%`, `width: 100%`, no width constraint.
- **New `.app-page`**: Full viewport container that will receive the app background.
  - `width: 100%`, `min-height: 100%`, `flex: 1`, `display: flex`, `flex-direction: column`.
  - This is the **only** node that gets the background style (no body/#root).
- **New `.app-content`**: Content width constraint (replaces body’s 640px).
  - `width: 100%`, `max-width: 640px`, `margin: 0 auto`, `flex: 1`, `display: flex`, `flex-direction: column`, `min-height: 0` (for flex children that scroll).

Resulting structure:

```text
html → body → #root → .app-page (background here) → .app-content (640px) → app content
```

---

## 2. Web: one component owns “page root” and applies background as a prop

- **No `useLayoutEffect`** that touches `document.body` or `#root`.
- **Single wrapper** in React: the component that wraps the app (e.g. current `ApplyAppBackground` or a renamed `AppPageRoot`) renders:
  - **Web**: A single DOM element (e.g. `<div data-app-page className="app-page" style={resolvedBackgroundStyle}>`) so the background is a **style prop** on that node. Its child is `<div className="app-content">…children…</div>`.
  - **Native**: Same idea: one wrapper View (or ImageBackground) with the resolved background style/source; its child is the content View (no 640px needed on native if not used, or same class for consistency).

So:

- **Background** = property on one element (the full-page container).
- **Platform** = only “div + CSS” vs “View/ImageBackground”; the *concept* (one container, one background) is shared.

Remove all `Platform.OS`-based branching that decides *where* to apply (body vs root); the “where” is always “the wrapper we render”.

---

## 3. Component responsibilities

- **ApplyAppBackground (or AppPageRoot)**  
  - Reads `appBackground` from preferences and resolves it to a style (or native props).  
  - Renders:
    - **Web**: `<div data-app-page className="app-page" style={resolvedWebStyle}><div className="app-content">{children}</div></div>`.
    - **Native**: `<ImageBackground|View style={...}><View style={contentStyle}>{children}</View></ImageBackground|View>`.
  - No effect that mutates document.body or #root. No duplicate “main-wrapper” with background.

- **AppShell**  
  - Stops wrapping with an extra “main-wrapper” and removes `bg-red-500`.  
  - Renders: `ApplyAppBackground` (or AppPageRoot) → children (Stack, etc.). So the only wrapper for “background + content width” is inside ApplyAppBackground.

- **ThemePickerSheet**  
  - Preview should apply to the **same** single node. Use a shared selector, e.g. `document.querySelector('[data-app-page]')`, and apply the preview style there instead of body + #root. (So one constant like `APP_PAGE_SELECTOR = '[data-app-page]'` and both ApplyAppBackground and ThemePickerSheet use it for consistency.)

---

## 4. Shared constant for “page root” (web)

- Define once, e.g. in `theme/backgrounds/` or a small `layout/constants.web.ts`:
  - `APP_PAGE_SELECTOR = '[data-app-page]'`
- Use in:
  - The component that renders the page root (so it sets `data-app-page` on that element).
  - ThemePickerSheet’s `applyWebAppBackgroundNow` (so it applies preview to that element only).

No `getElementById("root")` or body for background.

---

## 5. What to remove / change

| Item | Action |
|------|--------|
| `body { max-width: 640px; ... }` in tokens.css | Remove; move width constraint to `.app-content`. |
| useLayoutEffect in ApplyAppBackground that sets body/#root styles | Remove. |
| Applying webStyle to a View with className "main-wrapper" | Replace by applying style to the single `.app-page` div. |
| AppShell inner View with "main-wrapper ... bg-red-500" | Remove duplicate wrapper and debug class. |
| ThemePickerSheet `targets = [document.body, root]` | Change to single element: `document.querySelector(APP_PAGE_SELECTOR)`. |

---

## 6. Native

- Keep current native behavior: resolve background → ImageBackground or View with style.
- The “content” wrapper on native can be a simple `flex: 1` View (no 640px unless we want parity for tablets). No Platform.OS check for “where” to apply — we only branch on “how to render the single wrapper” (div vs View/ImageBackground).

---

## 7. Summary

- **One full-page container** (`.app-page` / `data-app-page`): full viewport, receives background as a **property** (inline style on web).
- **One content container** (`.app-content`): 640px max-width on web, inside the full-page container.
- **No body/#root background mutation**; no Platform.OS for “where”; layout and background are explicit and robust.

---

## Implementation review

**Confidence that this fixes the issue: high**, provided:

1. **Web**: The element that receives the background is the only one we style (`.app-page` / `[data-app-page]`). It is full viewport (CSS), so the background spans edge-to-edge. No `body`/`#root` mutation, so no wrong target or 640px conflict.
2. **Theme preview**: Same element is used for preview (`applyAppPageBackgroundStyle` → `[data-app-page]`), so preview and runtime match.
3. **E2E**: Tests were updated to assert on the page root element instead of `body`/`#root`, and the removed `dataset.appBgResolved` poll was dropped in favour of asserting computed style on `[data-app-page]`.

**What could still be wrong:**

- **React Native Web**: `dataSet={{ appPage: true }}` should become `data-app-page="true"` in the DOM; `className="app-page"` must be applied by the RN web layer. If the build strips classes or data attributes, the selector or layout could fail. Manual check in dev tools is recommended.
- **Native**: The 640px constraint exists only in CSS (`.app-content`); on native the inner `View` has no width constraint. That is intentional (mobile full width). If a tablet layout ever needs max width, we’d add a style there.

**More standard approaches (and why this one is fine):**

| Approach | Comment |
|----------|--------|
| **Single full-viewport wrapper with background** | What we did. Common pattern: one root div that owns background and wraps content. No need for a separate “background layer” div. |
| **CSS custom property on `:root`** | e.g. `--app-bg: ...` and `.app-page { background: var(--app-bg); }`. Would require one DOM write to set the variable. Same “one owner” idea; we chose inline style on the container so all background state stays in React and there is no DOM mutation. |
| **Fixed full-screen background div behind content** | Possible (e.g. `position: fixed; inset: 0`) but adds z-index and two layers. Single container is simpler and standard. |
| **Tailwind/NativeWind classes for background** | Dynamic values (user color, image URL) don’t map to static classes. Inline style (or CSS variables) is the right tool. |

**Conclusion:** The solution is standard (one wrapper, style on that wrapper), fixes the previous bugs (wrong target, double application, body width), and avoids DOM mutation. E2E now targets the correct element.
