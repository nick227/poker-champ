# Poker Champ — UI/UX Upgrade Proposal

---

## Core Principles

| Principle | Application |
|-----------|-------------|
| **Mobile-first** | Vertical layouts, touch targets, no cramped round table |
| **Sectioned table** | Board, players, pot, actions as distinct stacked/grouped sections |
| **Background Lobby** | Lobby lways in background |
| **Polish everywhere** | No screen left as placeholder; consistent visual language |
| **Fail-fast UX** | Clear feedback, obvious next steps, minimal friction |

---

## Lobby

**Lobby is always in background** (see Core Principles). Layout top-to-bottom:

```
┌────────────────────────────┐
│ Site Masthead              │  — logo, nav
├────────────────────────────┤
│ Avatar | Username | Location│  — profile strip
├────────────────────────────┤
│ [My Account] [Deposit]      │  — primary CTAs
├────────────────────────────┤
│ Bankroll*                  │  — prominent balance
├────────────────────────────┤
│ Current Status             │  — active games | scheduled games list
├────────────────────────────┤
│ [Sort] [Create Game]       │  — sort controls; Create opens popup
├────────────────────────────┤
│ Game List (table)          │  — sortable, crisp, readable
└────────────────────────────┘
```

**Game List columns:** Name | Blinds or Buy-in | Start time | Players | Seats | Avg pot size | Prize

**Interaction:**
- **Join upcoming games** — styled confirmation button per row
- **Fast sorting** — tap column header; crisp, readable table
- **Create Game** — opens popup (config, then create)

**Quality bar:** Readable at a glance; fast sort; clear join CTA; no clutter.

---

## Table Layout (Sectioned)

**Not** a traditional round table. Opponents at top, hero at bottom, board and pot centered. Dealer Announce Bar is a persistent strip between community cards and hero—where action is announced.

```
┌────────────────────────────┐
│ Top Bar                    │  7vh
├────────────────────────────┤
│ Opponent Strip             │  auto (max 22vh)  — lines of opponent avatars
├────────────────────────────┤
│ Spacer (flex)              │  min 2vh / flex
├────────────────────────────┤
│ Dealer Announce Bar        │  5vh              — "Player X bets $50", etc.
├────────────────────────────┤
│ Community Cards Row        │  11vh
│ Pot Display                │  4vh
├────────────────────────────┤
│ Spacer (flex)              │  min 2vh / flex
├────────────────────────────┤
│ Hero Zone                  │  ~18vh
│  • Calculations Strip      │  — Equity | Pot Odds | Outs (compact pills)
│  • Cards, bank, avatar     │
├────────────────────────────┤
│ Action Bar                 │  14vh (fixed)     — switches to "active" on your turn
└────────────────────────────┘
```

- **Opponent Strip**: Lines of opponent avatars along top; name, stack, status, bet/fold badges, dealer button. Tap avatar → Player History popup.
- **Dealer Announce Bar**: Persistent; dealer narration of current action (e.g. "Kenneth bets $250")
- **Community Cards + Pot**: Center; horizontal card row; pot chips below or beside
- **Hero Zone**: Calculations Strip (top) + your cards, bank, avatar (bottom); anchored above action bar
- **Action Bar**: Fixed height; state-driven (see below). Board, bank, bet, and actions visible in minimized mode too.

---

## Calculations Strip (Hero Zone)

**Row** inside Hero Zone, above hero cards/bank/avatar. Compact chips or pills.

**Content (v1):** `Equity: 42%` | `Pot Odds: 28%` | `Outs: 9`

Each item: small muted label + bold value. **Color-coded** — Green = favorable, Yellow = marginal, Red = poor.

**Contextual:** Updates based on current street, pot size, call amount, stack depth.

**Animation:** Never animate aggressively; never shift layout. Fade update smoothly on value change.

### Calculations Strip Visibility

| State | Visibility |
|-------|------------|
| **Your turn** | Fully visible |
| **Not your turn** | Slightly muted (opacity 0.6) |
| **Folded** | Hidden |

**Future:** Full stats view with more metrics, individual player history, and analytic insights—a unique advantage of the app. Start with three metrics; expand to detailed analytics later.

---

## Action Bar (Your Turn)

Total height: **14vh** (fixed). Four rows when active.

| Row | Content | Height |
|-----|---------|--------|
| 1 | Personal Status Text | 2.5vh |
| 2 | Primary Actions | 5vh |
| 3 | Bet Slider | 3.5vh |
| 4 | Quick Amount Buttons | 3vh |

**Row 1 — Personal Status Text**  
Single-line, centered, muted white. Examples:  
*"Your turn"* | *"You are all-in"* | *"You folded this hand"* | *"Waiting for next hand"*  
No narration—Dealer Announce Bar handles that.

**Row 2 — Primary Actions**  
`[FOLD]` `[CHECK/CALL]` `[BET/RAISE]`  
Stable order. Bet/Raise strongest emphasis.

**Row 3 — Bet Slider**  
Visible when betting/raising is possible. Fades out when not applicable; row still occupies space (no layout jump).

**Row 4 — Quick Amounts**  
`[MIN]` `[½]` `[POT]` `[MAX]`  
Small, rounded, touch-friendly.

### Action Bar State Behavior

| State | Row 1 | Rows 2–4 |
|-------|-------|----------|
| **Your turn** | "Your turn" | Visible |
| **Not your turn** | "Waiting for your turn" | Hidden (opacity 0); bar height unchanged |
| **Folded** | Status (e.g. "You folded this hand")  |
| **All-in** | Special Glow | Hidden |
| **Sitting out** | "Sitting out" | Hidden |

---

## Full-Screen vs Minimized Mode

| Mode | Purpose | Visible elements |
|------|---------|------------------|
| **Full-screen** | Primary play; immersive; all info at a glance | Full table layout, all players, board, pot, timer, actions |
| **Minimized** | Show lobby | quick glance bell icon with number of notifications click to open list of active tables

---

## User Flows

### Auth → Lobby

1. **Login**: Brand mark (logo)
2. **Lobby**: Masthead, profile (avatar, username, location), My Account / Deposit, bankroll, current status (active/scheduled), sort + Create Game, game list (Name | Blinds/Buy-in | Start | Players | Seats | Avg pot | Prize). Styled Join confirmation; fast column sorting.

### Lobby → Table

1. **Choose Table** (optional): Balance, buy-in slider, game speed (Fast/Normal), player count (3/6), Cancel/Apply.
2. **Join**: From lobby card or choose-table → active table full-screen.
3. **Private / Invite**: Invite-code input, “How to create” / “How to join” steps, CTA.

### In-Play

1. **Full-screen table**: Sectioned layout as above; action bar; optional chat overlay.
2. **Hand result**: Winner highlight, revealed hands, “Deal” to continue.
3. **Minimize**: Collapse to HUD; tap to restore.
4. **Multi-table**: Tabs for open tables; each tab shows minimized HUD; switch = full-screen for that table.

---

## Screen-by-Screen Polish Priorities

| Screen | Current | Target |
|--------|---------|--------|
| Login | Professional form | Branded, gradient bg, icons in fields, clear CTAs |
| Lobby | Simple list | Masthead, profile, My Account/Deposit, bankroll, status, sort+create, game list (sortable cols, styled Join) |
| Choose Table | — | Balance + chips, sliders, toggles, Apply/Cancel |
| Table (full) | Stub panels | Sectioned layout, Calculations Strip, player history popups, high-fidelity cards/chips, action bar, timer |
| Table (minimized) | — | Compact HUD: board, bank, bet, core actions |

---

## Visual Design System

- **Theme**: Dark base (bg, panel, border); green/gold accents for primary and highlight.
- **Typography**: Bold sans-serif for headers; readable body; muted for secondary.
- **Cards & chips**: High-fidelity; no shadows; clear suits and values, large readable.
- **Components**: Minimalism, SRP, fulll-screen, large format.
- **Transitions**: Between screens show rotating poker message on full screen with timer.

---

## Phased Roadmap

| Phase | Scope | Deliverables |
|-------|-------|--------------|
| **1. Foundation** | Design tokens, base components | Updated tokens.css/ts; Button, Input, Text, Card variants; icon set |
| **2. Auth & Lobby & Loading Screen** | Login, Index, Lobby, Loading | Polished login; lobby banner, table cards, bottom nav |
| **3. Table Layout** | Sectioned table UI | Player sections, board, pot, action bar (full-screen) |
| **4. Table Modes** | Full + minimized | Minimized dropdown HUD; expand/collapse; multi-table tabs |
| **5. Table Features** | Choose Table Color, Result | Choose-table modal |

---

## Success Criteria

- [ ] Every screen meets “polished gem” bar (no placeholders)
- [ ] Table readable and playable LARGE print
- [ ] Board, bank, bet, and actions visible in minimized mode
- [ ] Mobile-first: comfortable on phone; usable on tablet
- [ ] Consistent dark theme and accent palette across all screens
