# Hooks & Effects Review

## Key takeaways (≤20 lines)

- Overall hook usage is correct; dependency arrays are mostly solid.
- **Custom hooks** (useBankroll, useProfile): fetch once and guard against unmount updates.
- **useRealtimeChannel**: ref-based callback syncing prevents stale handlers; dependency design is good.
- **useTableRealtime**: callers should pass a stable `onError` (useCallback) to avoid effect churn.
- **Route → store sync** in table/[id].tsx is correct and idempotent.
- **Lobby** refresh effect is fine assuming store selectors are stable.
- **Animations** (HandResultOverlay, FadeTransition, PotWinRing, CalculationsStrip): generally safe; no setState on completion; short-lived, no cleanup required.
- **Toast** (fixed): `onDismiss` stored in ref; timer depends only on `duration`.
- **ModalSheet** (fixed): exit animation uses cancelled flag + cleanup so no setState/onClose after unmount.
- **Input** (fixed): static string is a constant, not useMemo.
- **ChooseTableModal**: effect correct; optional improvement — reset form when `visible` becomes true.
- **LoadingScreen**: interval correctly cleaned up.
- No widespread memory leaks. Main risks: unstable callbacks and effect-triggered timers/animations without cancellation.
- **After the three fixes above, hooks/effects are production-grade.**

---

## Detail

Summary of hooks/effects across components and custom hooks, with dependency arrays, cleanup, and suggested improvements.

---

## Custom hooks

| Hook | Effect / logic | Deps | Cleanup | Notes |
|------|----------------|------|--------|--------|
| **useBankroll** | Fetch balance once | `[]` | `cancelled = true` | Correct; avoids setState after unmount. |
| **useProfile** | Fetch profile once | `[]` | `cancelled = true` | Same pattern. |
| **useTableRealtime** | `onError` when !hasValidBuyIn; register sender | `[hasValidBuyIn, onError]`, `[tableId, realtime]` | Unregister sender | Pass stable `onError` (e.g. useCallback) to avoid extra runs. |
| **useRealtimeChannel** | Sync callback ref; create/teardown session | `[options]`, `[scope, id, enabled, joinOptions]` | `session.disconnect()` | Uses ref for callbacks so session always sees latest; deps are correct. |

---

## App / layout

| File | Effect | Deps | Notes |
|------|--------|------|--------|
| **_layout.tsx** | `bootstrapSdk()` once | `[]` | Correct. |
| **lobby.tsx** | `refresh()` on mount | `[refresh]` | Ensure `refresh` from store is stable (Zustand selectors are). |
| **lobby.tsx** | useCallback handleJoinApply, cycleSort | Correct deps | Good. |
| **table/[id].tsx** | Sync route → store: openTable(id) if needed, setActive(id) | `[tableId, openTableIds, openTable, setActive]` | Correct; re-runs after openTable updates store, then setActive is idempotent. |

---

## UI components with animation / timers

| Component | Effect | Deps | Cleanup | Fix / note |
|-----------|--------|------|--------|------------|
| **ModalSheet** | Enter animation when visible && !isExiting | `[visible, isExiting, backdrop, slide]` | None | Exit completion calls `setIsExiting(false)` and `onClose()` — add cancelled flag so we don’t call after unmount. |
| **ModalSheet** | Reset values when !visible && !isExiting | Same | None | Correct. |
| **HandResultOverlay** | Run sequence when visible | `[visible, lineScale, ...]` | None | No setState in animation completion; safe. Optional: stop animation on cleanup when visible flips. |
| **CalculationsStrip** | Flash opacity when equity/potOdds/outs change | `[equity, potOdds, outs, muted, opacity]` | None | Mutates `prev.current`; no cleanup for Animated.timing (short animation). |
| **CalculationsStrip** | Set opacity from visible | `[visible, opacity]` | None | Good. |
| **PotWinRing** | Run animation on mount | `[scale, opacity]` | None | Runs once; used inside HandResultOverlay so unmounts with overlay. Fine. |
| **FadeTransition** | Animate to visible ? 1 : 0 | `[visible, duration, opacity]` | None | No completion setState; safe. |
| **Toast** | setTimeout(onDismiss, duration) | `[onDismiss, duration]` | clearTimeout | If parent passes new `onDismiss` every render, timer resets. Use ref for onDismiss so effect deps are `[duration]` only. |

---

## Other components

| Component | Effect / hook | Notes |
|-----------|----------------|--------|
| **InjectWebTheme** | Inject style once (web) | `[]`; no cleanup by design. |
| **ChooseTableModal** | When buyInAtMax or maxAllowed change, set buyInCents | `[buyInAtMax, maxAllowed]` | Correct. Optional: when `visible` becomes true, reset form (e.g. buyInCents = minBuyInCents) so switching tables doesn’t carry stale state. |
| **LoadingScreen** | setInterval rotate message | `[]` | clearInterval on cleanup; good. |
| **Input** | useMemo for static string | `[]` | Unnecessary; use a constant. |

---

## Applied fixes (done)

1. **Toast**: Store `onDismiss` in a ref; effect depends only on `duration`. Prevents timer reset when parent re-renders with a new callback.
2. **ModalSheet**: Exit animation uses a cancelled flag; cleanup on unmount calls the cancel so we never call `setIsExiting(false)` or `onClose()` after unmount.
3. **Input**: Replaced `useMemo(() => "flex-1 py-3 text-text", [])` with constant `INPUT_CLASS`.

---

## Optional / deferred

- **ChooseTableModal**: Reset form when `visible` becomes true (e.g. `buyInCents = minBuyInCents`) for cleaner behavior when reopening for another table.
- **useTableRealtime**: Document that callers should pass a stable `onError` (useCallback) to avoid effect churn.
- **HandResultOverlay**: Stop animation in effect cleanup when `visible` becomes false (minor; no setState on completion today).
