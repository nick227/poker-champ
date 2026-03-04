# Button Style Developer Guide

## Purpose
Use this guide to build and maintain button UI consistently across the app.

This system is for React Native + NativeWind and is designed for dark UI surfaces.

## Source of Truth
- Base components:
  - `apps/client/src/components/base/Button.tsx`
  - `apps/client/src/components/base/ChipButton.tsx`
  - `apps/client/src/components/base/ConfirmButton.tsx`
  - `apps/client/src/components/base/IconButton.tsx`
- Utility classes:
  - `apps/client/tailwind.config.cjs`
- Tokens:
  - `apps/client/src/theme/tokens.css`

## Button Contract
Do not rename these.

- `intent`: `primary | secondary | neutral | danger | ghost`
- `size`: `sm | md | lg`
- `shape`: `pill | row`
- `state`: `default | pressed | disabled | loading | selected`

Notes:
- `icon` shape is implemented via `IconButton` + `btn-icon-*` classes.
- `variant` props remain supported for backward compatibility, but prefer `intent` going forward.

## Intent Rules

- `primary`
  - Main commit action in a local action group.
  - Examples: Join, Start, Continue, Apply, Bet/Raise.

- `secondary`
  - Safe, non-primary action.
  - Examples: Back, Cancel, Retry, Check/Call.

- `neutral`
  - Utility and low-emphasis actions.
  - Examples: filters, menu rows, quick chips, option toggles.

- `danger`
  - Destructive actions only.
  - Examples: Leave table, Delete, Logout, Remove.

- `ghost`
  - Text-forward low emphasis, transparent background.
  - Examples: inline low-priority actions.

## `Button` vs `Pressable`

Use `Button` for semantic actions that change app state.

Use raw `Pressable` for structure only:
- card wrappers
- row containers
- tile containers
- modal backdrops
- navigation wrappers

If a `Pressable` behaves like a button, style it with `btn-*` classes.

Good:
- `className="btn btn-neutral btn-row"`

Bad:
- `className="px-3 py-2 rounded bg-panel"`

## Layout Rule (Important)
Buttons are layout-neutral.

- Put spacing on containers (`gap-*`, wrapper `mt-*`), not on button instances.
- Avoid direct margin utilities on `<Button ... className="...">`.

## Recommended Patterns

### Standard action row
```tsx
<View className="flex-row gap-2">
  <Button title="Cancel" intent="secondary" className="flex-1" onPress={onCancel} />
  <Button title="Apply" intent="primary" className="flex-1" onPress={onApply} />
</View>
```

### Destructive action
```tsx
<Button title="Leave table" intent="danger" onPress={onLeave} />
```

### Filter chip
```tsx
<Button
  title="Winners"
  intent="neutral"
  size="sm"
  selected={active}
  onPress={onSelect}
/>
```

### Menu row action
```tsx
<Button title="Theme" intent="neutral" shape="row" onPress={onTheme} />
```

### Icon action
```tsx
<IconButton
  icon={<Icon name="menu" size={20} />}
  intent="ghost"
  size="md"
  onPress={onOpenMenu}
/>
```

## Accessibility Defaults
Already centralized in base components:
- `accessibilityRole="button"`
- `accessibilityState` disabled/busy
- icon buttons include `hitSlop={8}`

When using raw button-like `Pressable`, set:
- `accessibilityRole="button"`
- `accessibilityState={{ disabled: boolean }}` when applicable

## Interaction Defaults
Centralized in base components:
- pressed opacity
- pressed scale

Do not re-implement press animations in feature code unless there is a clear UX reason.

## Token Reference
Button colors are token-based in `tokens.css`:
- `--btn-primary-bg`, `--btn-primary-text`
- `--btn-secondary-bg`, `--btn-secondary-text`
- `--btn-neutral-bg`, `--btn-neutral-text`
- `--btn-danger-bg`, `--btn-danger-text`
- `--btn-icon-fg`
- `--accent-purple`, `--accent-purple-strong`

Do not hardcode button colors in features.

## Quick Review Checklist (PR)
- Semantic actions use `Button`.
- Structural taps use `Pressable`.
- Button-like `Pressable` uses `btn-*` classes.
- No ad-hoc `px/py/bg/rounded` button styling.
- No layout margins on `Button` instances.
- `danger` used only for destructive actions.
- Selected state uses `selected` + intent classes, not custom colors.

## Migration Tips
When converting old UI:
1. Replace semantic `Pressable` with `Button` first.
2. Move spacing to parent container.
3. Map old color intent to canonical intent.
4. Remove one-off style drift (`bg-*`, manual borders).
5. Verify pressed/disabled/loading behavior visually.

## Related Docs
- `docs/front-end/BUTTON_STYLE_PLAN.md`
- `docs/front-end/BUTTON_FINAL_POLISH_PUNCHLIST.md`
- `docs/guides/UI_DEVELOPER_GUIDE.md`
