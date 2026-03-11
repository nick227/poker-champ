# Table FX — Loop, Memory, and Control-Flow Analysis

Analysis of the table animation (FX) system for loop efficiency, memory usage, and control-flow clarity. Includes applied optimizations and remaining recommendations.

---

## 1. Data Paths and Traversals

### Registry

| Path | Before | After / Note |
|------|--------|--------------|
| **getPreloadSources()** | On every overlay mount: full scan of `TABLE_ANIMATIONS` × layers, new `Set` + array each call. | **Precomputed** at module load as `PRELOAD_SOURCES`. `getPreloadSources()` returns that array; O(1), zero allocations on mount. |
| **resolveAnimation(event, tier)** | Single lookup in `BY_EVENT_TIER` + at most 5 tier steps. O(1) amortized. | Unchanged. |
| **validateDefinitions()** | One pass over definitions; inner loops over layers and sounds. Run once at load. | Unchanged. |

### Theme

| Path | Before | After |
|------|--------|--------|
| **getAnimationTheme(event)** | Map lookup by event; cache stored same `defaultAnimationTheme` ref under multiple keys (e.g. `""`, `"POT_WIN"`). | **Single path:** always return `defaultAnimationTheme`. No Map, no lookups, no extra heap for cache. When per-event overrides exist, reintroduce a cache keyed by event. |

### Overlay

| Path | Before | After |
|------|--------|--------|
| **Lifecycle effect** | `Object.keys(activeByChannel)` then index with `activeByChannel[channel]` (two traversals). | **Single traversal:** `Object.entries(activeByChannel)` in a `for...of`; slot in hand each iteration. |
| **Render** | For each entry: `getAnimationTheme(req.event)` (one lookup per channel). | **One theme resolve** per render: `theme = getAnimationTheme(entries[0][1].request.event)` then reuse for all channels. |
| **Preload effect** | Called `getPreloadSources()` (previously did full registry scan). | Now O(1); returns precomputed array. |

---

## 2. Memory and Allocations

### Reduced or Removed

- **Theme cache Map** removed: no heap for cache or repeated same-ref entries.
- **getPreloadSources()** no longer allocates `Set` + result array on each overlay mount.
- **Overlay lifecycle:** one iteration via `Object.entries` instead of keys + index; no extra per-channel lookup.

### Unavoidable / By Design

- **setActiveByChannel(prev => ({ ...prev, [channel]: slot }))** and **setActiveByChannel(prev => { const next = { ...prev }; delete next[ch]; return next; })** allocate new objects so React sees updates. Required for correct state updates.
- **scheduleSoundCues:** allocates timeout IDs and, when `volume` is set, a small meta object per cue. Cues are few per definition; acceptable.
- **renderLayer:** returns new element trees per layer; React’s responsibility. No change.
- **Object.entries(activeByChannel)** in render: one array per render when there are active channels. Size is at most number of channels (small). Kept for clear, correct JSX.

### Layers (Particles, Burst, etc.)

- **AnimationLayerParticles:** `useRef(Array.from(...))` runs once per mount; particles array is stable. Effect builds `Animated.parallel([...])` when animation runs; required by API. Per-particle style objects in JSX are per render; could be optimized later with memoization if profiling shows need.
- **AnimationLayerBurst:** `Array.from({ length: rays }, ...)` in render allocates once per render; ray count is small (e.g. 8). Optional future: static index array up to max rays and slice, for marginal gain.

---

## 3. Control Flow and Branching

- **Lifecycle effect:** One loop over `[channel, slot]`; skip if already running; else setup timeout and cleanup. Clear single pass; no redundant branches.
- **Definition resolution:** Match tier, then fallback in a small `for (t = clamped - 1; t >= 0; t--)` loop. Simple and O(1) in practice.
- **Mapper tierFromPotAndHand:** Replaced `Object.entries(...).reduce(...)` with a **for-loop** over entries and a max boost; same complexity, clearer and no reduce closure.

---

## 4. Applied Optimizations Summary

1. **PRELOAD_SOURCES** built once at registry load; `getPreloadSources()` returns it (O(1), no mount-time scan).
2. **getAnimationTheme()** always returns `defaultAnimationTheme`; theme cache Map removed.
3. **Overlay render:** single `getAnimationTheme(entries[0][1].request.event)` per render; shared theme for all channels.
4. **Overlay lifecycle effect:** `for (const [channel, slot] of Object.entries(activeByChannel))` for one-pass iteration.
5. **Mapper:** HAND_STRENGTH_BOOST scan expressed as a for-loop instead of reduce.

---

## 5. Future Considerations (Not Implemented)

- **Reusable entries array in overlay:** Reusing a ref-backed array for `Object.entries` result and clearing/pushing each render would avoid one allocation per render but complicates React’s children model; defer unless profiling shows hot path.
- **Burst ray indices:** Predefined `[0..maxRays]` and `.slice(0, rays)` to avoid `Array.from` per render; small gain.
- **ANIMATION_DEBUG strings:** When debug is on, `def.layers.map(...).join()` and sounds string allocate; acceptable for debug-only path.
- **Per-event theme overrides:** When added, reintroduce a cache in `getAnimationTheme` keyed by event and populated on first access.

---

## 6. Metrics (Qualitative)

- **CPU:** Fewer traversals on overlay mount (no preload scan), one theme resolve per render, single-pass lifecycle loop.
- **Heap:** No theme Map; no per-mount preload Set/array; no redundant cache entries.
- **Clarity:** Single theme resolution and entries-based loop make data flow and control flow easier to follow.
