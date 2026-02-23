# UI Implementation Checklist

Actionable tasks for the studio-quality upgrade. Reference: `UI_UPGRADE_PROPOSAL.md`, `UI_COMPONENT_DESIGN.md`.

---

## Phase 1: Foundation

### Design Tokens
- [x] Update `tokens.ts` / `tokens.css`: dark base, green/gold accents
- [x] Colors: bg, panel, border, text, muted, brand, danger, success, warn
- [x] Spacing: xs, sm, md, lg
- [x] Radius: sm, md, lg
- [x] vh-based heights for table regions (7vh, 22vh max, 5vh, 11vh, 4vh, 18vh, 14vh)

### Base Primitives
- [x] Text variants: h1, body, muted, danger
- [x] Button: primary, ghost, danger
- [x] IconButton
- [x] ChipButton (compact pill)
- [x] ConfirmButton (styled for lobby Join)
- [x] TextInput, PasswordInput
- [x] Slider
- [x] Toggle
- [x] Badge, Pill, StatusDot
- [x] Row, Column, Stack, Spacer
- [x] Card (layout), Panel, Screen
- [x] Loader, ProgressBar
- [x] Divider

### Icons
- [x] Cohesive icon set (menu, settings, chat, fold, call, raise, etc.)
- [x] Poker suit symbols

---

## Phase 2: Auth & Lobby & Loading

### Login
- [x] Brand mark (logo) centered
- [x] Gradient background (dark base)
- [x] Username input with person icon
- [x] Password input with lock + visibility toggle
- [x] Remember me checkbox
- [x] Forgot password link
- [x] Register link
- [x] Primary login CTA

### Loading Screen
- [x] Full-screen rotating poker message
- [x] Timer / progress

### Lobby
- [x] Masthead (logo, nav)
- [x] Profile strip: Avatar | Username | Location
- [x] My Account button
- [x] Deposit button
- [x] Bankroll display (prominent)
- [x] Current status: active games | scheduled games list
- [x] Sort control
- [x] Create Game button → opens popup
- [x] Game list table: Name | Blinds/Buy-in | Start time | Players | Seats | Avg pot | Prize
- [x] Column header tap → fast sort
- [x] Styled Join confirmation button per row
- [x] EmptyState when no games

### Create Game Popup
- [x] Modal / bottom sheet
- [x] Config fields (name, blinds, buy-in, visibility, etc.)
- [x] Apply / Cancel

---

## Phase 3: Table Layout (Full-Screen)

### Shell
- [x] TopBar (7vh): balance, menu, settings
- [x] Sectioned layout with vh regions

### Opponent Strip (max 22vh)
- [x] OpponentRow / OpponentSeat components
- [x] Avatar, name, stack
- [x] Bet/fold badges
- [x] Dealer button indicator
- [x] Active turn ring
- [x] Tap avatar → Player History popup

### Dealer Announce Bar (5vh)
- [x] Persistent strip
- [x] Single-line narration ("Player X bets $50")

### Community Cards + Pot
- [x] CommunityBoard: horizontal card row (11vh)
- [x] PotDisplay (4vh)
- [x] PlayingCard component (high-fidelity, large readable)
- [x] CardBack
- [x] PotChipStack

### Hero Zone (~18vh)
- [x] CalculationsStrip: Equity | Pot Odds | Outs
- [x] MetricPill (muted label + bold value, color-coded green/yellow/red)
- [x] Visibility: your turn = full, not your turn = opacity 0.6, folded = hidden
- [x] Smooth fade updates, no layout shift
- [x] Hero cards, bank, avatar

### Action Bar (14vh fixed)
- [x] Row 1: ActionStatusText (2.5vh)
- [x] Row 2: PrimaryActionRow — Fold | Check/Call | Bet/Raise (5vh)
- [x] Row 3: BetSliderRow (3.5vh), fades when N/A, space preserved
- [x] Row 4: QuickAmountRow — MIN | ½ | POT | MAX (3vh)
- [x] State: your turn (all visible), not your turn (status only, rows 2–4 hidden), folded (status only), all-in (glow), sitting out

### Player History Popup
- [x] Trigger: tap opponent or hero avatar
- [x] Larger avatar
- [x] Stats: Avg VPIP, Avg PFR, Hands dealt
- [x] Join date, location
- [x] Dismiss: tap outside / close button

---

## Phase 4: Table Modes (Full + Minimized)

### Minimized HUD
- [x] Bell icon with notification count
- [x] Tap → list of active tables
- [x] Compact view: board strip, bank, bet, core actions
- [x] Tap row → expand to full-screen

### Multi-Table
- [x] Table tabs / picker
- [x] ActiveTablesPicker
- [x] TableNotificationBadge
- [x] Switch table = full-screen for selected

---

## Phase 5: Table Features

### Choose Table Modal
- [x] Balance + chip stack display
- [x] Buy-in range slider
- [x] Buy-in at max toggle
- [x] Game speed: Fast / Normal
- [x] Players: 3 / 6
- [x] Apply / Cancel

### Hand Result Overlay
- [x] Winner highlight
- [x] Revealed hands
- [x] Deal button to continue

### Chat (optional)
- [x] In-table chat overlay
- [x] Bubbles, avatars
- [x] Send input

---

## Phase 6: Secondary Screens

### Settings
- [x] Profile section
- [x] Logout button
- [x] Preferences (if any)

### Choose Table Color (if applicable)
- [ ] Table felt color picker

---

## Phase 7: Polish Pass

### Visual
- [x] Dark theme applied consistently
- [x] Green/gold accents
- [x] Large readable cards/chips
- [x] No shadows (per spec) or minimal

### Micro-interactions
- [x] FadeTransition where specified
- [ ] ChipFlyAnimation (optional)
- [ ] CardFlip (optional)

### Feedback
- [x] Toast for errors / confirmations
- [x] Loading states
- [x] Error states
- [x] Empty states

### Accessibility
- [x] Touch targets ≥ 44pt
- [x] Contrast meets WCAG

---

## Verification

- [x] Every screen meets polish bar (no placeholders)
- [x] Table readable at a glance, large print
- [x] Board, bank, bet, actions visible in minimized mode
- [x] Mobile-first: comfortable on phone
- [x] Consistent dark theme and accent palette
