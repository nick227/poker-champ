# Style Proposal: Actionable Runbook

One source of truth: `src/theme/tokens.css`. No raw colors or spacing in components. Use only `ui-surface` and `ui-surface-card` for blocks; only token-based Text/Button variants for type and actions.

---

## Phase 1: Tokens & readability (do first)

| # | Action | Where |
|---|--------|--------|
| 1.1 | Add comment at top of `tokens.css`: "All body/label text uses --c-text or --c-muted. No dark-on-dark." | `src/theme/tokens.css` |
| 1.2 | In InjectWebTheme (and +html if used): set `#root` and `#root *` color to inherit from body (body already `hsl(var(--c-text))`) so unstyled text is light. | `InjectWebTheme.tsx`, `+html.tsx` |
| 1.3 | Text: ensure every variant uses a light color (body/h1/h2 → text-text, label/muted → text-muted, danger → text-danger). Remove any dark variant. | `Text.tsx` |
| 1.4 | Input/PasswordInput: input and placeholder use `text-text` and `text-placeholder` (or equivalent token classes). | `Input.tsx`, `PasswordInput.tsx` |
| 1.5 | Button: all variants use label color `text-text`. | `Button.tsx` |

---

## Phase 2: Surfaces & layout (generic)

| # | Action | Where |
|---|--------|--------|
| 2.1 | Panel: class = `ui-surface-card` + `ui-p-lg`. No other backgrounds. | `Panel.tsx` |
| 2.2 | Card: class = `ui-surface` + `ui-p-md`. | `Card.tsx` |
| 2.3 | Input wrapper: `ui-surface` + `ui-p-md` + `ui-row ui-inline-2`. | `Input.tsx`, `PasswordInput.tsx` |
| 2.4 | BottomBar root: `ui-bottom-bar`. Each item: `ui-touch`. | `BottomBar.tsx` |
| 2.5 | Screen root: `flex-1 bg-bg px-4`. | `Screen.tsx` |
| 2.6 | Replace layout margins with parent gap: use `ui-col ui-stack-*` or `ui-row ui-inline-*` on the container; remove ad-hoc `margin*` / `gap` that aren’t token-based. | Auth, Lobby, any screen with stacked content |

---

## Phase 3: Buttons & touch

| # | Action | Where |
|---|--------|--------|
| 3.1 | Button primary: `min-h-[48px]`, `rounded-full`, `bg-brand`. Ghost: `rounded-full`, `border border-border`, `bg-transparent`. Danger: `rounded-full`, `bg-danger`. | `Button.tsx` |
| 3.2 | ChipButton: `rounded-full`; selected `bg-brand`, unselected `ui-surface`. Container for segmented control: `ui-surface rounded-full p-1`. | `ChipButton.tsx`, login mode switch |
| 3.3 | Any tappable icon or tab: add `ui-touch` (min 44×44). | BottomBar, icon buttons, auth toggle |

---

## Phase 4: Auth screen

| # | Action | Where |
|---|--------|--------|
| 4.1 | Root wrapper: `flex-1 justify-center items-center bg-bg px-4`. Inner column: `ui-col items-center w-full max-w-sm`. | `login.tsx` |
| 4.2 | AuthHero: wrapper `ui-col ui-center ui-stack-3`; glow = two absolute rounded views `bg-brand` low opacity; logo/title `variant="h1"`, tagline `variant="muted"`. | `AuthHero.tsx` |
| 4.3 | Mode switch: container `ui-row ui-surface rounded-full p-1 w-full`; two ChipButtons in `flex-1` wrappers; labels `text-text`. | `login.tsx` |
| 4.4 | Form: single Panel with `ui-col ui-stack-4`; fields use Input/PasswordInput (already ui-surface + ui-p-md); one full-width Button primary; error `Text variant="danger"`. No "Forgot password" or "No account?" links. | `login.tsx` |

---

## Phase 5: Lobby

| # | Action | Where |
|---|--------|--------|
| 5.1 | Screen content: `ui-col` with `ui-stack-*` between sections. No free-floating blocks. | `lobby.tsx` |
| 5.2 | Masthead: root has `ui-surface-card` or `ui-surface` + `ui-p-lg`. | `Masthead.tsx` |
| 5.3 | ProfileStrip / announcement: `ui-surface` or `ui-section-tight` / `ui-border-b` + padding. | `ProfileStrip.tsx` or lobby |
| 5.4 | BankrollDisplay: root `ui-surface` or `ui-surface-card` + token padding; amount `text-text`. | `BankrollDisplay.tsx` |
| 5.5 | Game list container: `ui-col ui-stack-3`. GameTableRow root: `ui-surface-card ui-p-lg`; inner `ui-row ui-inline-2`; Join = Button primary or ghost with contrast. | `lobby.tsx`, `GameTableRow.tsx` |
| 5.6 | One primary CTA per screen if present: full-width, `rounded-full`, `bg-brand`. BottomBar: `ui-bottom-bar`, items `ui-touch`. | `lobby.tsx`, `BottomBar.tsx` |

---

## Phase 6: Table shell

| # | Action | Where |
|---|--------|--------|
| 6.1 | TableLayout root: `flex-1 ui-surface-card overflow-hidden` (border/radius from utility). | `TableLayout.tsx` |
| 6.2 | TableTopBar: `ui-border-b`, `ui-p-inline-4`, `ui-row`; text `text-text`. | `TableTopBar.tsx` |
| 6.3 | OpponentStrip: each seat wrapper has consistent padding + radius (e.g. `ui-surface` or `.poker-seat`). | `OpponentStrip.tsx` |
| 6.4 | ActionBar root: `ui-bottom-bar`; Fold = danger, Check/Call = ghost/primary, Bet/Raise = primary; ChipButtons MIN/½/POT/MAX = `ui-surface` + `rounded-full`, selected `bg-brand`. | `ActionBar.tsx` |

---

## Phase 7: Poker tokens & one-time decisions

| # | Action | Where |
|---|--------|--------|
| 7.1 | Add poker tokens only when implementing table visuals: `--c-felt`, `--r-table` (table edge radius), `--r-card`, `--c-chip-low`, `--c-chip-mid`, `--c-chip-high`. Optional: felt texture (very low contrast). | `tokens.css` |
| 7.2 | Seat state: implement one map or `getSeatStateStyles(state)` → Active = ring (brand/gold), Dealer = gold disk, Folded = grayscale + opacity, All-in = glow, Sitting out = desaturated + "Out" badge. Use in OpponentStrip + HeroZone only. | `OpponentStrip.tsx`, HeroZone or shared util |
| 7.3 | Action colors (fixed): Fold = danger, Check/Call = neutral, Bet/Raise = brand, All-in = gold. Use only these in ActionBar and labels. | `ActionBar.tsx`, copy |
| 7.4 | Pot typography > bet typography; call amount highlighted (brand); money dominates labels. Max 2 numerics per row in seat/pot. | PotChipStack, CommunityBoard, HeroZone |
| 7.5 | Motion: fades only, no bounce. Chip change: short linear/ease-out (e.g. 200–300ms). Card flip: simple flip, no 3D. Timer: circular ring, smooth depletion, last 3s warning color, no blink. | Table components, timer component |
| 7.6 | Add 2–3 `poker-*` classes in tailwind.config if needed (e.g. `.poker-chip-stack`, `.poker-card-slot`, `.poker-seat`); otherwise use Tailwind token classes in domain/table. Document in COMPONENTS.md. | `tailwind.config.cjs`, COMPONENTS.md |

---

## Quick reference (rules to follow)

**Panels**  
- Only `ui-surface` (rows, inputs, bars) or `ui-surface-card` (forms, cards, modals, table root). Padding: `ui-p-md` or `ui-p-lg`. No raw `bg-*` colors.

**Buttons**  
- Primary: pill, 48px min height, `bg-brand`, label `text-text`. One primary CTA per screen. Ghost/danger: pill, `text-text`. All tappables: `ui-touch` where applicable.

**Fonts & color**  
- One font family in tokens; Text variants = type scale. Use only `text-text`, `text-muted`, `text-danger` (and semantic variants) for copy. Backgrounds: `bg-bg`, `bg-panel`, `bg-panel-elevated`; no hex in components.

**Poker**  
- Felt: `--c-felt`, inner edge, table radius. Chips: denomination colors, ring outline, micro scale+fade on change. Cards: one ratio, one radius, even spacing. Seat states and action colors: use the single matrix/map. No shadows; no decorative gradients; no pattern outside felt.

---

## Checklist (mark as done)

- [x] 1.1–1.5 Readability & tokens
- [x] 2.1–2.6 Surfaces & layout
- [x] 3.1–3.3 Buttons & touch
- [x] 4.1–4.4 Auth
- [x] 5.1–5.6 Lobby
- [x] 6.1–6.4 Table shell
- [x] 7.1 Poker tokens (felt, r-table, r-card, chip-low/mid/high); 7.2–7.6 as needed for table components

Done = no dark-on-dark text, every block has a surface, auth/lobby/table follow the runbook, poker uses tokens and one seat/action map.
