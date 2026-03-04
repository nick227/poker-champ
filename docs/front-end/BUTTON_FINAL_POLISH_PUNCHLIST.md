# Button System Final Polish Punch List

Date: 2026-03-04
Scope: final consistency, contract enforcement, accessibility, interaction quality.

## Summary
- Status: Ready for visual QA and ship review.
- Type safety: pass (`pnpm -C apps/client exec tsc --noEmit`).
- Major contract enforcement complete across high-traffic flows.

## Contract Checks

1. Semantic actions use canonical `Button`
- Pass in key flows:
  - [ActionBar.tsx](c:\wamp64\www\poker-champ\apps\client\src\components\domain\table\ActionBar.tsx)
  - [TableTopNavMenu.tsx](c:\wamp64\www\poker-champ\apps\client\src\components\domain\table\TableTopNavMenu.tsx)
  - [LessonContent.tsx](c:\wamp64\www\poker-champ\apps\client\src\features\lessons\LessonContent.tsx)
  - [settings.tsx](c:\wamp64\www\poker-champ\apps\client\app\settings.tsx)
  - [ChatOverlay.tsx](c:\wamp64\www\poker-champ\apps\client\src\components\domain\chat\ChatOverlay.tsx)

2. `Pressable` reserved for structure
- Pass in core table/lesson surfaces:
  - Modal backdrops and row wrappers remain `Pressable`.
  - Button-like table rows use `btn-*` classes:
    - [ActiveTablesDropdown.tsx](c:\wamp64\www\poker-champ\apps\client\src\components\domain\table\ActiveTablesDropdown.tsx)

3. Button layout-neutral
- Pass in direct regressions fixed:
  - Removed button margin usage in [settings.tsx](c:\wamp64\www\poker-champ\apps\client\app\settings.tsx)
  - Menu spacing handled by wrappers/containers in [TableTopNavMenu.tsx](c:\wamp64\www\poker-champ\apps\client\src\components\domain\table\TableTopNavMenu.tsx)

## Styling Checks

1. Row button padding normalized
- Pass:
  - `btn-row` owns row padding in [tailwind.config.cjs](c:\wamp64\www\poker-champ\apps\client\tailwind.config.cjs)
  - Removed local `py-*` override on `btn-row` usage in [ActiveTablesDropdown.tsx](c:\wamp64\www\poker-champ\apps\client\src\components\domain\table\ActiveTablesDropdown.tsx)

2. Token usage for button colors
- Pass:
  - Tokens defined in [tokens.css](c:\wamp64\www\poker-champ\apps\client\src\theme\tokens.css)
  - Classes mapped via token values in [tailwind.config.cjs](c:\wamp64\www\poker-champ\apps\client\tailwind.config.cjs)

3. Pressed interaction consistency
- Pass:
  - Centralized opacity+scale in [Button.tsx](c:\wamp64\www\poker-champ\apps\client\src\components\base\Button.tsx)
  - Icon parity in [IconButton.tsx](c:\wamp64\www\poker-champ\apps\client\src\components\base\IconButton.tsx)

4. Icon interaction quality
- Pass:
  - `IconButton` uses >=44px sizes (`btn-icon-md` etc.)
  - `hitSlop={8}` added in [IconButton.tsx](c:\wamp64\www\poker-champ\apps\client\src\components\base\IconButton.tsx)
  - Ghost pressed highlight added

## Accessibility Checks

1. Base button semantics
- Pass:
  - `accessibilityRole="button"` in [Button.tsx](c:\wamp64\www\poker-champ\apps\client\src\components\base\Button.tsx)
  - `accessibilityState` includes disabled/busy

2. Icon semantics
- Pass:
  - `accessibilityRole="button"` + disabled state in [IconButton.tsx](c:\wamp64\www\poker-champ\apps\client\src\components\base\IconButton.tsx)

3. Remaining button-like Pressable semantics
- Minor follow-up:
  - Add `accessibilityState={{ disabled: ... }}` to row action pressable in
    [ActiveTablesDropdown.tsx](c:\wamp64\www\poker-champ\apps\client\src\components\domain\table\ActiveTablesDropdown.tsx)

## Visual QA Checklist (Manual)

1. Action Bar hierarchy
- Confirm in gameplay:
  - Fold = danger
  - Check/Call = secondary
  - Bet/Raise = primary

2. Filter chips
- Confirm in leaderboard:
  - neutral base
  - selected state reads clearly

3. Menu rows
- Confirm in table top menu and active tables dropdown:
  - neutral row consistency
  - spacing rhythm matches prior design

4. Icon buttons
- Confirm on top nav, close controls, send/chat controls:
  - touch target feels generous
  - pressed feedback visible

5. Disabled/loading states
- Confirm for:
  - action bar disabled actions
  - loading/retry controls
  - chat send disabled with empty input

## Open Items (Low Risk)

1. Contrast validation audit (visual)
- Run quick AA check on representative screens:
  - primary/secondary/neutral/danger text on button backgrounds.
- Files to verify visually:
  - [ActionBar.tsx](c:\wamp64\www\poker-champ\apps\client\src\components\domain\table\ActionBar.tsx)
  - [leaderboard.tsx](c:\wamp64\www\poker-champ\apps\client\app\leaderboard.tsx)
  - [TableTopNavMenu.tsx](c:\wamp64\www\poker-champ\apps\client\src\components\domain\table\TableTopNavMenu.tsx)

2. Optional polish
- In [TableTopNavMenu.tsx](c:\wamp64\www\poker-champ\apps\client\src\components\domain\table\TableTopNavMenu.tsx), convert `mb-1` wrappers to parent `gap-*` if visual parity remains acceptable.

## Recommendation
Proceed to manual visual QA and accept if checklist passes. No architectural changes are required for ship readiness.
