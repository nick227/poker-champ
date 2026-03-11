# Table FX — Component Effects: Research (Layout-Neutral Options)

Summary of **reliable options** for adding visual effects **without affecting layout, position, or siblings**. The chosen architecture (see [TABLE_FX_COMPONENT_EFFECTS.md](./TABLE_FX_COMPONENT_EFFECTS.md)) is **anchor-based overlay only**: board/hero/seat accents are overlay layers clipped to anchor rects; table components are not modified. The patterns below still apply to how those overlay layers are implemented (absolute, clipped to bounds, opacity/scale only).

---

## Constraint (reminder)

- Do **not** change position of any element or its siblings.
- Do **not** add nodes that participate in flex layout if they would shift other nodes.
- Prefer techniques that are **purely visual** and do not affect the box model or layout flow.

---

## Reliable options

### 1. Absolute-positioned overlay sibling(s) — **preferred**

**Pattern:** Add one or more sibling `View`s with `position: 'absolute'`, `top: 0`, `left: 0`, `right: 0`, `bottom: 0` (and optionally `pointerEvents: 'none'`) inside the **existing** parent that already defines the hit area/size. The effect view fills the parent and is **removed from layout flow**; it does not affect the size or position of the parent or any sibling.

**Existing precedent in codebase:** `PotWinRing` in `PotWinEffect.tsx` — two `Animated.View`s with `position: 'absolute'`, `top/left/right/bottom: 0`, `borderRadius`, `borderWidth`, `borderColor`. They sit inside the same parent as the tile content; the parent’s size and flex behavior are unchanged.

**Rules:**
- Parent must already have a defined size (so the absolute child can fill it).
- Do **not** introduce a **new** wrapper View just to hold the effect if that wrapper would be in the flex flow (e.g. an extra `<View style={{ flexDirection: 'row' }}>` around existing content). Only add absolute-positioned **siblings** inside an existing container.
- To “ring” or “glow” around a block: the block must already live in a parent that has dimensions; add the effect as an absolute sibling that fills that parent (and use border/opacity on the effect view, not on the content).

**Safe:** Adding an absolute sibling inside `CommunityBoard`’s row container, or inside the existing avatar+meta column in HeroZone / OpponentStripItemView, so long as we do not add a new layout wrapper.

---

### 2. Shadow props (visual only, no layout)

**Pattern:** Apply `shadowColor`, `shadowOffset`, `shadowOpacity`, `shadowRadius` (iOS) and/or `elevation` (Android) to an **existing** View. These properties are **purely visual**; they do not affect the element’s layout size or the position of siblings.

**Caveats:**
- Shadow is drawn outside the border box but does not change layout or reflow.
- Platform differences: full shadow control on iOS; on Android, `elevation` is the main lever. Cross-platform glow may need a fallback (e.g. absolute overlay with blurred edge or solid ring).

**Safe:** Using shadow on an existing View to suggest glow/halo without adding any new node or changing layout.

---

### 3. Opacity / transform on existing node

**Pattern:** Animate `opacity` or `transform` (e.g. `scale`) on an **existing** View. These do not affect layout flow (transform creates a new stacking context but does not change layout space; opacity is visual only).

**Caveats:**
- Do not change `width`/`height`/`margin`/`padding`/`flex` as part of the effect.
- Safe for subtle pulse or fade on the **same** node that already exists.

---

## What to avoid (rejected)

| Approach | Why rejected |
|----------|--------------|
| New wrapper View around content that is in the flex flow | Adds a layout node; can change flex order, size, or position of children/siblings (e.g. wrap avatar+meta in `<View style={{ flexDirection: 'row' }}>` for the effect). |
| Adding or changing `margin`/`padding`/`borderWidth` on existing nodes for the effect | `borderWidth` is part of the box model in RN; margin/padding directly affect position of self and siblings. |
| Changing `flex`/`alignSelf`/`order` or container `gap`/`justifyContent` to “make room” for effect | Explicitly changes layout and sibling position. |
| Using `outline` for glow | Not reliably supported in React Native on native platforms (web-only or partial support). |
| Relying on `boxShadow` in RN | Platform support varies; shadow props / elevation are the standard and are layout-neutral. |

---

## Summary table

| Technique | Layout impact | Use for component FX |
|-----------|----------------|----------------------|
| Absolute-positioned sibling(s) inside existing parent | None | Ring/glow around board row or avatar+meta block (parent already has size). |
| Shadow props on existing View | None | Optional subtle glow on card or avatar (platform-dependent). |
| Opacity / transform on existing View | None | Subtle pulse or fade. |
| New flex wrapper around content | **Shifts layout** | **Rejected.** |
| Extra margin/padding/borderWidth for effect | **Shifts layout** | **Rejected.** |

---

## References

- React Native: [View Style Props](https://reactnative.dev/docs/view-style-props) — `position: 'absolute'` removes from layout flow; shadow props and transform are documented.
- Existing pattern: `PotWinEffect.tsx` (PotWinRing) — absolute sibling ring inside parent; no wrapper added to flex.
- CSS (conceptual): box-shadow and outline do not affect layout; in RN, shadow props are the analogue and do not affect layout.
