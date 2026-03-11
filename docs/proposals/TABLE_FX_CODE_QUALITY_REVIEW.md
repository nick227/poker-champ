# Table FX — Code Quality Review

Focus: performance and code consistency. Findings and fixes.

---

## 1. Performance

### 1.1 getAnimationTheme allocates every call when event has override
**Issue:** For POT_WIN, ALL_IN, SHOWDOWN we merge palette and return a new theme object every time. Overlay calls it once per channel per render; any parent re-render causes new allocations and can trigger downstream re-renders when theme is passed as prop.

**Fix:** Cache resolved theme by event (max 3 entries). Return same reference for same event so overlay/layers don’t see a new object when nothing changed.

**Status:** Applied in animationTheme.ts.

### 1.2 Overlay effect depends on onComplete
**Issue:** The lifecycle effect lists `[activeByChannel, settings.enabled, onComplete]`. If the parent passes an inline `onComplete` (e.g. `onComplete={() => setState(...)}`), every parent re-render creates a new function and the effect re-runs: cleanup cancels timeouts and the loop re-executes. Animations can restart or never fire completion.

**Fix:** Store the required `onComplete` in a ref, update it each render, and call the ref from the timeout. Remove `onComplete` from the effect dependency array so the effect only depends on `activeByChannel` and `settings.enabled`.

**Status:** Applied in TableAnimationOverlay.tsx.

### 1.3 Particles: ref initial value ignores prop changes
**Issue:** `useRef(Array.from({ length: particleCount }, ...))` only uses `particleCount`/`particleSpread` on first mount. If the same component instance ever received different props later, the ref would still hold the first mount’s array.

**Assessment:** In current use we don’t reuse: each animation run mounts new layers, and they unmount when the animation ends. So props are fixed for the component’s lifetime. No change; documented as an assumption.

### 1.4 Burst: Array.from in render
**Issue:** `Array.from({ length: rays }, (_, i) => ...)` allocates a new array every render. Rays is typically 6–16.

**Assessment:** Small fixed size; no per-frame animation loop. Acceptable. If we ever need to optimize, we could memoize by rays or use a static max and slice.

### 1.5 useNativeDriver
**Status:** All Animated.timing calls use `useNativeDriver: true`. Good; animations run on the native thread.

---

## 2. Code consistency

### 2.1 Layer component pattern
**Status:** All procedural layers follow the same pattern: refs for Animated values, single useEffect that starts sequence/parallel with optional delay, cleanup for setTimeout. Naming: `run` vs `start` is inconsistent (Flash/Ring use `run`, Burst uses `start`). Prefer one name; low impact.

### 2.2 Fallback constants
**Status:** Each layer defines FALLBACK_* for color/size; theme supplies values so fallbacks are rarely used. Naming is consistent. TextLayer also has FALLBACK_SIZE_MAP duplicating theme textScale; it’s only used when fontSize prop is omitted (theme supplies it). OK.

### 2.3 Delay cleanup pattern
**Status:** All layers use `const t = delayMs > 0 ? setTimeout(...) : run(); return () => (typeof t === "number" ? clearTimeout(t) : undefined);`. When delayMs is 0, `run()` is invoked and `t` is the return value of `run()` (undefined). Cleanup correctly only clears when t is a number. Consistent.

### 2.4 TextLayer: inline style object for non-glow offset
**Issue:** `textShadowOffset: glow ? GLOW_TEXT_SHADOW_OFFSET : { width: 0, height: 0 }` allocates a new object when glow is false.

**Fix:** Use a named constant (e.g. `TEXT_SHADOW_OFFSET_NONE`) so we don’t allocate on every render.

**Status:** Applied in TextLayer.tsx.

### 2.5 Registry: getAllDefinitions()
**Status:** Flattens TABLE_ANIMATIONS with `Object.values(...).flat()`. Called at module load for validation and preload; not on hot path. Fine.

---

## 3. Summary of applied fixes

| Item | File | Change |
|------|------|--------|
| Theme cache | animationTheme.ts | Per-event cache for getAnimationTheme; return cached theme when event is POT_WIN/ALL_IN/SHOWDOWN. |
| onComplete deps | TableAnimationOverlay.tsx | Store onComplete in ref; effect deps [activeByChannel, settings.enabled]. |
| Zero shadow offset | TextLayer.tsx | Constant TEXT_SHADOW_OFFSET_NONE for non-glow path. |

---

## 4. Not changed (by design or low impact)

- Particles/Burst ref and array allocation: acceptable for current usage and scale.
- Flash empty styles.flash: harmless.
- Naming run vs start across layers: cosmetic; can be unified later.
- FALLBACK_SIZE_MAP in TextLayer: keeps layer usable without theme; acceptable.

---

## 5. References

- [TABLE_FX_SUMMARY.md](../roadmaps/TABLE_FX_SUMMARY.md) — Inventory and structure.
- [TABLE_FX_OPTIMIZATION_ANALYSIS.md](../roadmaps/TABLE_FX_OPTIMIZATION_ANALYSIS.md) — Data paths and allocations (if present).
