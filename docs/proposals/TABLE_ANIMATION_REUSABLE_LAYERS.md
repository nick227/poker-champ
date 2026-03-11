# Reusable Animated Layers — Proposal

Discussion: **truly animated** layers (pre-authored clips) that can be reused across animations, organized in a **registry**, and played back on a **shared canvas** (or single playback surface).

---

## Current vs pre-authored layers

| | Current (procedural) | Pre-authored (reusable clip) |
|--|----------------------|------------------------------|
| **Source** | Code: React components with `Animated` / params | Asset: Lottie, sprite sheet, or canvas sequence |
| **Reuse** | Same component + different params per definition | Same clip asset referenced by id in many definitions |
| **Control** | durationMs, delayMs, rays, etc. in layer def | Clip has fixed length; def can set delay, scale, tint |
| **Design** | Devs tweak code or theme | Designers export one clip; used in pot win, all-in, flush |

A **reusable animated layer** is a single asset (e.g. “gold burst”), registered once and referenced by id from any event/tier that needs it. Same clip, same file, many uses.

---

## Clip registry

A second registry, separate from the animation definition registry:

- **Key**: stable id (e.g. `burst-gold`, `particles-spark`, `ring-win`).
- **Value**: clip source (Lottie JSON URI, sprite sheet path, or canvas sequence descriptor) + optional metadata (default duration, loop: no, anchor: center).
- **Usage**: Layer def can say `type: "CLIP"`, `clipId: "burst-gold"` instead of (or in addition to) `type: "BURST"` with params.

Definitions stay data-only: they reference `clipId`; the overlay (or a dedicated layer component) looks up the clip and plays it. Designers add or replace clips without changing definition logic.

---

## Reusing the same canvas

Today each layer is a separate view (e.g. one View per FLASH, BURST, TEXT). For pre-authored clips we can:

- **Single playback surface**: One component (e.g. one Lottie view, or one canvas) that is the only thing that ever runs a “clip” layer. When the overlay runs a layer with `type: "CLIP"`, it passes `clipId` to this component. The component loads (or reuses cached) the clip and plays it. When the next layer runs, the same component is **reused** for the next clip (or cleared if the next layer is procedural). So we don’t mount one Lottie per layer; we have one Lottie (or one canvas) that swaps content.
- **Benefits**: Fewer DOM nodes, one place to manage preload/cache, consistent rendering pipeline, easier to add crossfade or shared transforms later.
- **Layering**: The overlay still composites multiple layers in order (back to front). So we might have: layer 0 = CLIP `flash-soft`, layer 1 = CLIP `burst-gold`, layer 2 = procedural TEXT. The “same canvas” applies to **clip layers only**: one physical canvas/Lottie view that, over time, shows clip 0, then clip 1, etc., each at the correct z-index and time. In other words, the **registry of clips** is shared, and the **playback surface** for those clips is one (or a small pool), not one-per-layer.

---

## Layer def shape (optional extension)

Keep existing layer types; add a parallel path for clips:

```ts
// Existing
type: "FLASH" | "BURST" | "PARTICLES" | "RING" | "TEXT"
+ params (durationMs, rays, …)

// Optional: pre-authored clip
type: "CLIP"
clipId: string      // key into clip registry
delayMs?: number
scale?: number
tint?: string       // optional color overlay
```

Overlay: if `type === "CLIP"`, resolve `clipId` from the clip registry, pass to the single-clip player; else render procedural layer as today.

---

## Organizing the registry

- **Clip registry**: e.g. `ANIMATION_CLIPS` in `animationClipRegistry.ts`, or a JSON manifest loaded at startup. Entries: `{ id: "burst-gold", source: require("./assets/burst-gold.json"), durationMs: 600 }`.
- **Naming**: By look or role, not by event: `burst-gold`, `burst-red`, `particles-spark`, `ring-win`, `flash-soft`. So pot win and flush win can both reference `burst-gold`; all-in can reference `burst-red`.
- **Reuse**: Same clip id in many definitions. No duplication of asset or playback surface.

---

## Summary

| Idea | Description |
|------|-------------|
| **Truly animated layer** | Pre-authored clip (Lottie/sprite/canvas) instead of only procedural code. |
| **Reuse across animations** | One clip id (e.g. `burst-gold`) referenced from multiple event/tier definitions. |
| **Clip registry** | Map id → asset + metadata; definitions reference by id. |
| **Same canvas** | One (or few) playback surfaces for all clip layers; swap clip by id per layer; fewer nodes, one place to cache and play. |

This stays additive: existing procedural layers and definitions remain; we add CLIP + registry + single playback surface when we introduce pre-authored assets.
