# Handoff: Poker Lobby Redesign

## Overview
Redesign of the Lobby home screen (cash games list, tournaments list, summary cards, Create Game modal, quick-action panel) fixing visual inconsistencies in the current app (mismatched button styles, cramped rows, thin empty states) and adding new content: an "Avg Hand" stat per cash table, a joined/pinned row treatment, an enrolled-players count, and a 4-up quick-actions panel (Quick Start bots, Leaderboard, Poker Training, Profile).

## About the Design Files
`Poker Lobby.dc.html` in this bundle is a **design reference**, not production code — it's an HTML/React prototype built in our design tool to show exact layout, spacing, color, and copy. **Do not copy this file into the app.** Recreate the design in `poker-champ`'s existing environment: React Native + Expo, NativeWind (Tailwind) classes, and the existing component library (`@/components/base/Button`, `Text`, `Input`, `ChipButton`, `@/components/containers/ModalSheet`, `Ionicons`). Reuse the existing lobby files listed under **Files** below — this is a styling/structure update to those components, not a rewrite.

## Fidelity
High-fidelity. Colors, spacing, and copy below are final; recreate pixel-close using the app's real design tokens (`tokens.css` / NativeWind theme), not the prototype's raw hex/hsl literals where an equivalent token already exists.

## Design Tokens
Pull these from the app's real `tokens.css` (already confirmed in the codebase) — do NOT introduce new tokens:
- `--c-bg`: `hsl(0 0% 5%)`
- `--c-panel`: `hsl(0 0% 9%)` (card/section surfaces)
- `--c-panel-elevated`: `hsl(0 0% 12%)` (row hover, modal surface)
- `--c-border`: `hsl(0 0% 18%)`
- brand green (`text-brand`/`bg-brand`): `hsl(158 52% 42%)` — primary action color, live/open status, cash-game accent
- gold (`text-gold`/`bg-gold`): `hsl(42 82% 50%)` — decorative only (trophy icon, table-mark ring); do not use for buttons or status
- text primary: `hsl(0 0% 96%)`; muted: `hsl(0 0% 60%)`
- danger (existing `text-danger`/`bg-danger` token) for any negative/loss indicator

Typography: system sans (`Helvetica Neue`/system-ui equivalent already in app), no serif. Title 30px/700/-0.02em tracking. Section eyebrows 11–12px/600/uppercase/0.06–0.08em tracking. Row text 13–15px. Tabular numerals (`font-variant-numeric: tabular-nums` / `font-mono` class already used in `LobbyCashDesktopRow`) on all numeric columns.

Radii: 8–10px on buttons/pills, 12px on cards, 999px on pills/badges. Shadows: subtle only — `0 2px 8px rgba(0,0,0,.25)` on stat cards, `0 4px 16px rgba(0,0,0,.3)` on section cards.

## Screens / Views

### 1. Lobby header
- Top bar (existing, unchanged structurally): logo mark (poker-chip motif: circular ring in gold `border:2px solid`, small dashed inner circle) + "Poker Champ" wordmark, left. Online count + balance pill, right. Balance pill: chip-ring badge (same motif) + `$9,581.54` in tabular nums.
- Page header: "Lobby" title (30px/700) + subtitle "Jump into cash games or register for upcoming tournaments." (15px, muted).
- Actions, right-aligned: **New cash table** (primary, brand-green fill, grid icon) and **Create tournament** (secondary, transparent + border, trophy icon). Both same height/radius/padding (10–16px). This replaces the old mismatched purple/ghost combo — one consistent primary/secondary button pair, matching `Button intent="accent"` / `intent="ghost"` already in `LobbyPageHeader.tsx`.

### 2. Quick actions panel (NEW)
4-up grid (`grid-template-columns: repeat(auto-fit, minmax(220px,1fr))`, 14px gap; wraps to 2×2 on narrow viewports) replacing a "recent activity" ticker concept that was cut for being confusing. Each card: white/panel background, 1px border, **2px brand-green top border accent**, 10px radius, subtle shadow. Left: 38px circular icon badge (2px brand-green ring, icon in brand-green, transparent center) — bot/dice icon, bar-chart icon, book icon, person icon respectively. Right: bold 14px label + 12px muted subtitle.
- Quick Start — "Play bots heads-up or 6-max"
- Leaderboard — "See where you rank"
- Poker Training — "Sharpen your strategy"
- My Profile — "Stats & hand history"

These are placeholder destinations — wire to whatever routes/screens already exist for bot instant-play, leaderboard, lessons, and profile.

### 3. Summary cards (Cash Games / Tournaments)
Two-column grid, equal width. Each card: panel background with a very subtle brand-green radial tint in the top-left corner (`radial-gradient(120% 140% at 0% 0%, hsl(158 40% 20% / .18), transparent 60%)`), 12px radius, 18px/22px padding, subtle shadow. Header row: small icon (poker-chip ring for Cash Games in green; trophy outline for Tournaments in gold) + uppercase eyebrow label (muted, 12px/600/tracked). Body row: `{count} Table(s) Live` ・ diamond bullet (5px square rotated 45°, muted/gold) ・ `{count} Seats Available` — same pattern for Tournaments with Upcoming Events / Players Registered. This is a straight visual refresh of the existing `LobbySummaryCards.tsx`; keep its real pluralization logic.

### 4. Cash Games section
Card with 2px brand-green top border, header row with a poker-chip icon (green) + "CASH GAMES" eyebrow. Column header row (uppercase, muted, 11px): **TABLE / STAKES / PLAYERS / AVG HAND / STATUS / (action)**, 6-column grid `1.8fr 1fr 1fr 1fr 1fr 0.9fr`.
Row (per table), 16px/24px padding, bottom border, hover → panel-elevated background:
- Table name, bold 15px
- Stakes: `$small / $big`, tabular nums
- Players: `{filled} / {max}`, tabular nums — **no avatar stack, no seat dots** (removed per feedback — they duplicated the same info and added noise)
- **Avg Hand** (NEW): average pot size at the table, `$14.50` style, tabular nums — replaces an earlier "recent hands" sparkline concept that was cut as unnecessary/fabricated data; wire to a real average-pot stat if available, otherwise omit the column rather than fake it
- Status: plain text label, no color dot (dot was removed as unnecessary — text color alone, brand-green for Open/Joined, muted otherwise, is enough)
- Action button: **fixed-width (92px), centered text**, brand-green fill, white text — label is "Join" normally, "Resume" for a table the user is already seated at (pinned). One button type only, consistent width/color across cash rows AND the tournament "Register" button — do not reintroduce distinct button styles per action type.

**Pinned/joined row**: when the current user has a seat at a table, tint the whole row with a faint brand-green wash (`hsl(158 40% 14%)`) — matches the real app's existing `pinned` treatment in `LobbyCashDesktopRow.tsx` (`bg-brand-soft/70`); just keep it subtle.

**Empty state**: centered, 52px vertical padding — "No open cash tables right now." (16px/600) + "Create a cash table to get a game going." (14px muted) + primary "New cash table" button.

### 5. Tournaments section
Same card treatment as Cash Games but 2px **brand-green** top border too (gold reserved for the trophy icon and countdown text only — keep the two sections visually consistent, don't reintroduce a second gold accent bar). Columns: **TOURNAMENT / BUY-IN / ENROLLED / STARTS / STARTED / LATE REG / STATUS / (action)**, 7-column grid `2fr 0.8fr 1fr 1.3fr 0.9fr 1fr 0.9fr`.
- Enrolled: plain `{count} / {max}` text, tabular nums — **no progress bar/underline** under it (tried, felt like an unwanted underline; removed)
- "Starts in X min" / "Started Xm ago": **normal font-weight** (not bold), gold text color — this is informational, not a CTA, so don't over-emphasize it
- Action button: same fixed-width green button as cash rows, label "Register"
- Empty state: same pattern as Cash Games, tournament copy + "Create tournament" CTA

### 6. Create Game modal
Centered overlay, 460px wide, `panel-elevated` background, 14px radius, 26px padding, backdrop blur + 60% black scrim. Header: "Create Game" (20px/700) + "Close" text button, right.
Sections, each an 11px/600/uppercase/muted eyebrow label followed by a wrapping row of pill/chip options (this already matches `ChipButton` — selected = green border + tinted fill, unselected = border only, transparent):
1. **Instant Play** — 9-Max / Heads-Up
2. **Table Name** — text input, dark fill, bordered, 8px radius
3. **Blinds** — $1/$2, $2/$5, $5/$10, $100/$200
4. **Min Buy-in** — $40 (20BB), $100 (50BB), $200 (100BB)
5. **Visibility** — Public / Private
6. **Num Players** — 3 / 6 / 9 Players
7. **Show Stats** — On / Off

Footer: Cancel (secondary/ghost) + Apply (primary/green), right-aligned. This is a straight visual-consistency fix on the existing `CreateGameModal.tsx` — every option group should render as the same `ChipButton` component with the same selected/unselected treatment (the current app already has this component; the bug being fixed is visual, not structural).

## Interactions & Behavior
- All buttons/rows have a hover state (row → `panel-elevated` background; buttons → `brightness(1.1–1.12)` filter or border/background lightening for outlined buttons).
- Modal closes on backdrop click, "Close", "Cancel", or "Apply".
- Quick-action cards navigate to their respective existing screens/flows.
- No new async/loading states introduced by this redesign — reuse the existing loading/skeleton components already present (`GameTablePanelSkeleton.tsx`) for cash/tournament list loading.

## Assets
No new image assets. All icons are simple line icons (home, dice/grid, book, bar-chart, person, trophy, chip-ring) — use the existing `Ionicons` set already used in `LobbyPageHeader.tsx` / `LobbySummaryCards.tsx` (e.g. `grid-outline`, `trophy-outline`, `trophy`) rather than introducing a new icon library; substitute equivalents for the poker-chip ring motif (e.g. a custom small `View` with a circular border, as already implemented for the balance/logo mark in the prototype).

## Screenshots
See `screenshots/` — `01-lobby-top.png` (header, quick actions, summary cards), `02-create-game-modal.png` (Create Game modal), `03-cash-tournament-rows.png` (cash/tournament list rows incl. pinned/joined row state).

## Files
- `Poker Lobby.dc.html` — full design reference (this bundle)
- Existing app files this redesign updates (in `apps/client/src/features/lobby/`):
  - `components/lobby/LobbyPageHeader.tsx`
  - `components/lobby/LobbySummaryCards.tsx`
  - `components/lobby/LobbyCashDesktopRow.tsx` (+ `SeatOccupancy.tsx` — remove usage per this redesign)
  - `components/lobby/TournamentLobbyRow.tsx`
  - `components/lobby/CreateGameModal.tsx`, `createGame.constants.ts`
  - `components/lobby/EmptyState.tsx`
  - New: a quick-actions panel component (no existing equivalent — create new, e.g. `LobbyQuickActions.tsx`)
