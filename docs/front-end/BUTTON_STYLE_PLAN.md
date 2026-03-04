# Button Style Plan (Dark UI)

## Goal
Define a clear, scalable button color system for dark surfaces so each action type has consistent meaning, readable contrast, and predictable usage.

This plan assumes the app canvas and surfaces remain dark.

## Core Principles
- Use color semantically, not decoratively.
- One primary CTA per local context (screen section, modal footer, key action row).
- Secondary and neutral actions should not compete with primary.
- Destructive actions are always visually distinct.
- Icon-only actions default to transparent unless emphasis is required.

## Proposed Button Types

## 1) `btn-primary`
Primary forward action.

Visual:
- Background: hot purple
- Text/icon: white
- Border/accent: subtle lighter purple top edge

Use for:
- Main "go" actions: Join, Apply, Start, Continue, Bet/Raise equivalent primary action.
- Exactly one dominant action in a cluster.

Do not use for:
- Destructive actions
- Utility links
- Dense filter chips

## 2) `btn-secondary`
Supportive action with clear affordance but lower priority.

Visual:
- Background: light gray
- Text/icon: white
- Border: slightly stronger gray border for separation from dark panel

Use for:
- Cancel, Back, Retry, alternate path actions.
- Important but not primary controls.

Do not use for:
- Primary conversion/forward action
- Destructive action

## 3) `btn-neutral`
Low-emphasis utility/control action.

Visual:
- Background: white
- Text/icon: black
- Border: optional subtle border (light gray) if needed for surface blending control

Use for:
- Filters, segmented options, menu rows, contextual utility actions.
- Inline low-risk actions where high visual priority is not needed.

Do not use for:
- Final confirm actions
- Destructive actions

## 4) `btn-danger`
Destructive/high-risk action.

Visual:
- Background: danger red
- Text/icon: white
- Border/accent: optional light top edge

Use for:
- Delete, Leave table, Logout, Remove.

Rule:
- Never style dangerous actions as neutral/secondary.

## 5) `btn-icon` (transparent variant)
Icon-only chrome/action control.

Visual:
- Background: transparent
- Icon: white
- Border: transparent or subtle stroke depending on density

Use for:
- Top bar menu triggers, close icons in overlays, quick utility icon taps.

Escalation:
- If icon action is primary or dangerous, use icon with `btn-primary`/`btn-danger` instead of transparent.

## State Rules (all types)
- `default`: base colors from type.
- `pressed`: opacity reduction + slight scale (already in base `Button`).
- `disabled`: reduced opacity; keep semantic hue recognizable.
- `loading`: keep button color; replace label with spinner or show spinner + label depending on context.
- `selected` (chips/filters): use selected treatment derived from type, not arbitrary color.

## Selected/Segmented Rules
For segmented chips and category filters:
- Unselected: `btn-neutral` (white bg, black text)
- Selected: `btn-primary` (purple bg, white text) OR `btn-neutral + selected border` when low emphasis is preferred

Default recommendation:
- Competitive/active selection (e.g. gameplay modifiers): selected purple.
- Informational filters: selected border first, then purple if stronger emphasis needed.

## Size + Shape Rules
- `pill-sm`: compact filters/chips/tool rows.
- `pill-md`: default form and page actions.
- `pill-lg`: major CTA blocks.
- `icon-sm|md|lg`: icon-only actions.
- `row`: full-width menu/list action rows.

Spacing rule:
- Button remains layout-neutral; spacing belongs to parent containers.

## Mapping by Product Area

## Lobby
- Create game / Start lesson / Join / Apply: `btn-primary`
- Sort / Cancel / Retry: `btn-secondary`
- Modal options and segmented choices: `btn-neutral` + selected rule
- Delete table: `btn-danger` (icon or pill based on context)

## Learn
- Start/Continue/Next: `btn-primary`
- Back/Retry: `btn-secondary`
- Related links and mini actions: `btn-neutral`
- Minimize/show lesson controls: `btn-neutral` compact

## Board (Leaderboard)
- Category chips: `btn-neutral` unselected, selected rule (prefer purple selected)
- Retry: `btn-secondary`

## Settings
- Change avatar / utility actions: `btn-secondary`
- Logout/remove actions: `btn-danger`

## Table
- Bet/Raise/Call primary path action: `btn-primary`
- Check/utility/support actions: `btn-secondary`
- Quick amount chips and menu rows: `btn-neutral`
- Leave table/remove bots where destructive: `btn-danger`
- Top chrome icons: transparent `btn-icon`

## Suggested Token Additions
Add explicit semantic button tokens so colors are not hardcoded in components:
- `--c-btn-primary-bg`
- `--c-btn-primary-fg`
- `--c-btn-secondary-bg`
- `--c-btn-secondary-fg`
- `--c-btn-neutral-bg`
- `--c-btn-neutral-fg`
- `--c-btn-danger-bg`
- `--c-btn-danger-fg`
- `--c-btn-icon-fg`

Optional accent token:
- `--c-accent-purple` (hot purple family)

## Guardrails
- No ad-hoc button colors in feature components.
- Semantic action -> `Button` first.
- If using raw `Pressable` for semantic action, must use `btn-*` class family.
- New button colors require token + doc update in the same PR.

## Rollout
1. Add/adjust tokens for gray/white/purple/icon palette.
2. Map `btn-primary|secondary|neutral|danger` classes to these tokens.
3. Validate contrast on dark panel and dark canvas states.
4. Migrate high-traffic screens first (Lobby/Table/Learn), then remaining routes.
