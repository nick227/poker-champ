# Components Reference

A single reference for all UI components: purpose, props, and usage. Components are grouped by layer (base → containers → domain).

**Import path prefix:** `@/components/base/`, `@/components/containers/`, or `@/components/domain/<feature>/`.

---

## 1. Layers

| Layer | Path | Role |
|-------|------|------|
| **Base** | `src/components/base/` | Primitives: typography, buttons, inputs, layout. No domain logic. |
| **Containers** | `src/components/containers/` | Structure: screen chrome, modals, navigation bars. |
| **Domain** | `src/components/domain/<feature>/` | Feature-specific: lobby, table, loading. Compose base + containers. |

Use base and containers from anywhere. Use domain components only in app screens or other domain code for that feature.

---

## 2. Base Components

### 2.1 Typography

**Text**  
`@/components/base/Text`

All on-screen text. Forwards React Native `Text` props plus `variant`.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| variant | `"body"` \| `"h1"` \| `"h2"` \| `"label"` \| `"muted"` \| `"danger"` | `"body"` | Visual style (size, color). |
| style | ViewStyle | — | Merged with variant styles. |

Use `h1` for page titles, `h2` for section titles, `body` for main content, `muted` for secondary text, `label` for small caps labels, `danger` for errors or destructive emphasis.

---

### 2.2 Buttons

**Button**  
`@/components/base/Button`

Primary actions and navigation. Press feedback via opacity.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| title | string | — | Label. |
| onPress | () => void | — | Handler. |
| disabled | boolean | false | Disables press and dims. |
| variant | `"primary"` \| `"ghost"` \| `"danger"` | `"primary"` | primary = brand green, ghost = border only, danger = red. |

**IconButton**  
`@/components/base/IconButton`

Icon-only control (e.g. chat, close). Uses `ui-touch` (min 44pt).

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| icon | ReactNode | — | Usually `<Icon name="…" />`. |
| onPress | () => void | — | Handler. |
| disabled | boolean | false | Disables and dims. |
| variant | `"primary"` \| `"ghost"` | `"ghost"` | primary = brand bg, ghost = border. |

**ChipButton**  
`@/components/base/ChipButton`

Segmented choice (e.g. Fast/Normal, 3/6 players). One of many options.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| title | string | — | Label. |
| onPress | () => void | — | Handler. |
| selected | boolean | false | Selected state (brand bg). |
| disabled | boolean | false | Disables and dims. |

**ConfirmButton**  
`@/components/base/ConfirmButton`

Single prominent CTA (e.g. “Join” on a table row). Styled like primary with gold edge.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| title | string | — | Label. |
| onPress | () => void | — | Handler. |
| disabled | boolean | false | Disables and dims. |

---

### 2.3 Inputs

**Input**  
`@/components/base/Input`

Single-line text field with optional label and left icon. Uses `ui-surface` and `PLACEHOLDER_COLOR`.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| label | string | — | Shown above field (muted). |
| iconLeft | string | — | Emoji or character left of input. |
| value, onChangeText, placeholder, … | TextInputProps | — | Passed to underlying TextInput. |

**PasswordInput**  
`@/components/base/PasswordInput`

Password field with show/hide toggle. Copy for toggle from `PASSWORD_INPUT` in constants.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| label | string | — | Shown above field. |
| value | string | — | Controlled value. |
| onChangeText | (t: string) => void | — | Handler. |
| placeholder | string | — | Placeholder text. |

**Slider**  
`@/components/base/Slider`

Numeric range with −/+ controls. Displays current value with `formatCents` (suited for bet/buy-in in cents).

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| value | number | — | Current value. |
| min, max | number | — | Range. |
| onValueChange | (v: number) => void | — | Handler. |
| step | number | 1 | Increment for −/+. |
| disabled | boolean | false | Dims and blocks changes. |

**Toggle**  
`@/components/base/Toggle`

Boolean on/off (e.g. preferences, “Buy-in at max”).

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| value | boolean | — | Current state. |
| onValueChange | (v: boolean) => void | — | Handler. |
| disabled | boolean | false | Dims and blocks toggling. |

---

### 2.4 Feedback & layout

**Pill**  
`@/components/base/Pill`

Label + value pair (e.g. Equity 42%, Pot Odds 28%). Fixed min width and tabular numbers to avoid layout shift.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| label | string | — | Left label (muted). |
| value | string | — | Right value (body). |
| variant | `"neutral"` \| `"success"` \| `"warn"` \| `"danger"` | `"neutral"` | Border/background tint. |
| className | string | `""` | Extra classes. |

**Badge**  
`@/components/base/Badge`

Small status chip (neutral/success/danger). Single string child.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| children | string | — | Badge text. |
| variant | `"neutral"` \| `"success"` \| `"danger"` | `"neutral"` | Style. |

**Loader**  
`@/components/base/Loader`

Full-area centered spinner. Uses fixed brand-colored ActivityIndicator.

**Toast**  
`@/components/base/Toast`

Temporary message (e.g. errors). Rendered by AppShell from toast store; auto-dismisses.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| message | string | — | Text. |
| variant | `"default"` \| `"success"` \| `"danger"` | `"default"` | Style. |
| onDismiss | () => void | — | Called on timeout or user dismiss. |
| duration | number | 3000 | Auto-dismiss ms. |

**FadeTransition**  
`@/components/base/FadeTransition`

Opacity show/hide with `pointerEvents` tied to `visible`. Used for action bar rows.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| visible | boolean | — | Shown when true. |
| duration | number | 200 | Animation ms. |
| children | ReactNode | — | Content. |
| …props | ViewProps | — | Passed to Animated.View. |

---

### 2.5 Layout primitives

**Row, Column, Spacer, Divider**  
`@/components/base/Layout`

- **Row**: `ui-row` (flex row, center align). Optional `className`.
- **Column**: `ui-col` (flex col). Optional `className`.
- **Spacer**: Flexible space; `flex` prop (default 1).
- **Divider**: `ui-divider` (1px border line). Optional `className`.

Prefer Tailwind `ui-row`, `ui-col`, `ui-stack-*`, `ui-inline-*` on `View` where that’s enough; use these when you want a named component.

**Panel**  
`@/components/base/Panel`

Card-style block: `ui-surface-card` + padding. Accepts `children`, `className`.

**Card**  
`@/components/base/Card`

Card with `ui-surface` + padding. Optional `onPress`; when set, wraps in Pressable.

---

### 2.6 Icons

**Icon**  
`@/components/base/Icons`

Named icon (character/emoji). Exports `ICONS`, `SUITS`, `IconName`, `Icon`.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| name | IconName | — | menu, settings, chat, fold, call, raise, send, back, close, bell, user, lock. |
| size | number | 20 | Font size. |
| className | string | `""` | Extra classes. |

Use `SUITS` for suit symbols; card faces use domain `PlayingCard`.

---

## 3. Container Components

**Screen**  
`@/components/containers/Screen`

Root content wrapper: SafeAreaView, `flex-1`, `bg-bg`, `ui-p-inline-4`. Use once per route content.

| Prop | Type | Description |
|------|------|-------------|
| children | ReactNode | Page content. |

**AppShell**  
`@/components/containers/AppShell`

Root layout in `_layout.tsx`: children (Stack), global Toast from store, optional “DEV TRANSPORT: WS” badge.

| Prop | Type | Description |
|------|------|-------------|
| children | ReactNode | Typically Stack. |

**BottomBar**  
`@/components/containers/BottomBar`

Tab bar for Lobby / Table / Settings. Uses `screen.registry` and `tablePath` for table tab.

| Prop | Type | Description |
|------|------|-------------|
| active | `"lobby"` \| `"table"` \| `"settings"` | Current tab (highlight + label). |

**ModalSheet**  
`@/components/containers/ModalSheet`

Slide-up sheet: backdrop fade, panel slide, title row with close. Use for forms and detail overlays.

| Prop | Type | Description |
|------|------|-------------|
| visible | boolean | Shown when true. |
| onClose | () => void | Called when closing (after animation). |
| title | string | Header text. |
| children | ReactNode | Body (padding applied). |

**TopBar**  
`@/components/containers/TopBar`

Generic top bar: optional left/right slots, centered title. Not used by table (TableTopBar is domain).

| Prop | Type | Description |
|------|------|-------------|
| title | string | Center title. |
| left, right | ReactNode | Optional slots. |

**ListItem**  
`@/components/containers/ListItem`

Row with title, optional subtitle, optional right node, optional onPress.

| Prop | Type | Description |
|------|------|-------------|
| title | string | Main text. |
| subtitle | string | Muted line below. |
| right | ReactNode | Trailing content. |
| onPress | () => void | Optional; makes row pressable. |

---

## 4. Domain Components

### 4.1 Lobby (`domain/lobby/`)

**Masthead**  
Logo/title strip with gold accent line. Uses `APP_NAME` from copy. No props.

**ProfileStrip**  
Avatar initial + username + optional location.

| Prop | Type | Description |
|------|------|-------------|
| username | string | Display name. |
| location | string | Optional secondary line. |

**BankrollDisplay**  
Prominent balance with label. Gold-soft left border.

| Prop | Type | Description |
|------|------|-------------|
| amountCents | number | Balance; displayed via formatCents. |

**GameListHeader**  
Sort button + Create Game button. Uses TABLE copy.

| Prop | Type | Description |
|------|------|-------------|
| onSort | () => void | Sort cycle. |
| onCreateGame | () => void | Open create modal. |
| sortLabel | string | e.g. "Sort: name". |

**GameTableRow**  
One lobby table row: name, players/seats, stakes, Join button. Uses `ConfirmButton` and `LobbyTableRow` from `@/lib/lobbyTables`.

| Prop | Type | Description |
|------|------|-------------|
| table | LobbyTableRow | id, name, players, seats, blinds, minBuyInCents, maxBuyInCents, etc. |
| onJoin | () => void | Join CTA. |

**EmptyState**  
Centered message when list is empty.

| Prop | Type | Description |
|------|------|-------------|
| message | string | e.g. "No games available. Create one!" |

**CreateGameModal**  
Modal form: name, seats, blinds, buy-in range, visibility. Uses ModalSheet, Input, Button.

| Prop | Type | Description |
|------|------|-------------|
| visible | boolean | Open state. |
| onClose | () => void | Close. |
| onSubmit | (config) => void | Config: name, maxSeats, smallBlindCents, bigBlindCents, minBuyInCents, maxBuyInCents, visibility. |

**ChooseTableModal**  
Modal: balance, buy-in slider, buy-in at max toggle, speed (Fast/Normal), players (3/6). Uses ModalSheet, Slider, Toggle, ChipButton, Button.

| Prop | Type | Description |
|------|------|-------------|
| visible | boolean | Open state. |
| onClose | () => void | Close. |
| balanceCents | number | User balance. |
| minBuyInCents, maxBuyInCents | number | Allowed range. |
| onApply | (opts) => void | opts: buyInCents, speed, players. |

---

### 4.2 Table (`domain/table/`)

**TableLayout**  
Full table composition: TableTopBar, OpponentStrip, DealerAnnounceBar, CommunityBoard, HeroZone, ActionBar. Single place to wire game state to table UI.

| Prop | Type | Description |
|------|------|-------------|
| balanceCents | number | Hero balance in top bar. |
| opponents | Opponent[] | id, name, stackCents, isDealer?, isActive?, status?. |
| communityCards | Card[] | rank/suit or null. |
| potCents | number | Pot amount. |
| heroCards, heroStackCents | Card[], number | Hero hand and stack. |
| actionState | "yourTurn" \| "notYourTurn" \| "folded" \| "allIn" \| "sittingOut" | Drives action bar visibility and status. |
| dealerMessage | string | Dealer announce bar text. |
| equity, potOdds, outs | number | Calculation strip. |
| topBarLeft, topBarRight | ReactNode | Slots in top bar. |
| onFold, onCheckCall, onBetRaise, onMin?, onHalf?, onPot?, onMax? | () => void | Action handlers. |
| onPlayerPress? | (opponent) => void | Tap opponent avatar. |
| betValue?, betMin?, betMax?, onBetValueChange? | number / (v: number) => void | Bet slider when applicable. |

**TableTopBar**  
7vh bar: left slot, balance, right slot.

| Prop | Type | Description |
|------|------|-------------|
| balanceCents | number | Center display. |
| left, right | ReactNode | Optional. |

**OpponentStrip**  
Horizontal wrap of opponent seats: avatar initial, name, stack, dealer “D”, folded badge. Optional onPlayerPress for each seat.

| Prop | Type | Description |
|------|------|-------------|
| opponents | Opponent[] | id, name, stackCents, isDealer?, isActive?, status?, betCents?. |
| onPlayerPress? | (opponent) => void | Tap to open player history. |

**DealerAnnounceBar**  
5vh strip: single-line dealer message (e.g. “Bob bets $250”).

| Prop | Type | Description |
|------|------|-------------|
| message | string | Shown as muted text; empty shows “Waiting…”. |

**CommunityBoard**  
Community cards row + pot row. Uses PlayingCard, PotChipStack.

| Prop | Type | Description |
|------|------|-------------|
| cards | Card[] | rank/suit or null (face-down). |
| potCents | number | Pot display. |

**HeroZone**  
Calculations strip (Equity / Pot Odds / Outs) + avatar + hero cards + stack. Uses CalculationsStrip, PlayingCard, formatCents.

| Prop | Type | Description |
|------|------|-------------|
| cards | Card[] | Hero hand. |
| stackCents | number | Hero stack. |
| isMyTurn | boolean | Strip muted when false. |
| folded | boolean | Strip hidden when true. |
| equity, potOdds, outs | number | For CalculationsStrip. |

**CalculationsStrip**  
Row of Pills: Equity %, Pot Odds %, Outs. Fade on value change; reserves space when hidden (no layout shift). Uses Pill.

| Prop | Type | Description |
|------|------|-------------|
| equity, potOdds, outs | number | Values. |
| visible? | boolean | Default true; false = opacity 0, space kept. |
| muted? | boolean | Opacity 0.6 when not your turn. |

**ActionBar**  
14vh bar: status line, Fold / Check / Bet row, bet slider (when your turn), MIN / ½ / POT / MAX chips. Uses FadeTransition for action rows.

| Prop | Type | Description |
|------|------|-------------|
| state | "yourTurn" \| "notYourTurn" \| "folded" \| "allIn" \| "sittingOut" | Drives status copy and visibility. |
| onFold, onCheckCall, onBetRaise | () => void | Required. |
| onMin?, onHalf?, onPot?, onMax? | () => void | Quick bet amounts. |
| betValue?, betMin?, betMax?, onBetValueChange? | number / (v: number) => void | Slider when your turn. |

**PlayingCard**  
Single card: face-down (“?” on brand bg) or rank + suit. Fixed size; text-lg for readability.

| Prop | Type | Description |
|------|------|-------------|
| rank?, suit? | string | e.g. "A", "s". Omit for face-down. |
| faceDown? | boolean | Show back. |

**CardBack**  
Same as `<PlayingCard faceDown />`.

**PotChipStack**  
Decorative chip stack (brand/success/danger circles with gold border) + amount text. Used for pot display.

| Prop | Type | Description |
|------|------|-------------|
| amountCents | number | Shown via formatCents. |

**PotWinRing**  
Animated gold ring around children (e.g. winner cards). Bloom then settle. Used inside HandResultOverlay.

| Prop | Type | Description |
|------|------|-------------|
| children | ReactNode | Content to wrap. |

**TableNotificationBell**  
Bell icon + badge count. Uses Icon, Text. Badge uses brand bg and text-text for contrast.

| Prop | Type | Description |
|------|------|-------------|
| count | number | Badge number; hidden if ≤ 0. |
| onPress | () => void | Tap handler. |

**MultiTableTabs**  
Horizontal tabs for open table ids. Uses store openTableIds/activeTableId/setActive; navigates via tablePath.

No props. Renders nothing if no open tables.

**ActiveTablesDropdown**  
Modal list of active tables: id, pot, bet, bank, “Your turn” pill. Uses RN Modal + backdrop; no ModalSheet.

| Prop | Type | Description |
|------|------|-------------|
| visible | boolean | Show modal. |
| onClose | () => void | Dismiss. |
| tables | { id, potCents?, bankCents?, betCents?, isYourTurn? }[] | Rows. |
| onSelectTable | (id: string) => void | Navigate to table and close. |

**HandResultOverlay**  
Full-screen overlay: winner line (name + PotWinRing-wrapped cards), opponent cards, pot, Deal button. Animated reveal.

| Prop | Type | Description |
|------|------|-------------|
| visible | boolean | Show overlay. |
| winnerName | string | e.g. "You". |
| winnerCards, opponentCards? | { rank, suit }[] | Cards. |
| potCents | number | Pot won. |
| onDeal | () => void | Continue. |

**ChatOverlay**  
ModalSheet “Chat”: message list (self vs others styling), input + send. Uses MODAL/CHAT copy, PLACEHOLDER_COLOR.

| Prop | Type | Description |
|------|------|-------------|
| visible | boolean | Show. |
| onClose | () => void | Close. |
| messages? | { id, sender, text, isSelf? }[] | Default []. |
| onSend? | (text: string) => void | Send handler. |

**PlayerHistoryPopup**  
ModalSheet with large avatar initial, VPIP/PFR/Hands pills, join date, location.

| Prop | Type | Description |
|------|------|-------------|
| visible | boolean | Show. |
| onClose | () => void | Close. |
| name | string | Player name. |
| vpip?, pfr?, hands? | number | Stats. |
| joinDate?, location? | string | Optional. |

**StatChip**  
Label + value block (e.g. for dev/panel). Uses ui-surface.

| Prop | Type | Description |
|------|------|-------------|
| label | string | Muted label. |
| value | string | Body value. |

---

### 4.3 Loading (`domain/loading/`)

**LoadingScreen**  
Full-screen: Loader + rotating message from LOADING_MESSAGES. No props.

---

## 5. When to Use What

- **New screen:** `Screen` + domain blocks + optional `BottomBar`. No raw layout primitives unless needed.
- **Form in a modal:** `ModalSheet` + `Input` / `PasswordInput` / `Slider` / `Toggle` / `ChipButton` / `Button`.
- **List row:** Prefer domain row (e.g. `GameTableRow`) or `ListItem` for generic rows.
- **Numeric label + value:** `Pill` (with variant) or `StatChip` (simpler).
- **Segmented choice:** `ChipButton` with `selected` per option.
- **Primary CTA:** `Button variant="primary"` or `ConfirmButton` for emphasis.
- **Icon-only action:** `IconButton` + `Icon`.
- **Show/hide with fade:** `FadeTransition` (e.g. action bar rows).
- **All text:** `Text` with appropriate `variant`; use copy constants and formatCents where applicable.

See `UI_DEVELOPER_GUIDE.md` for where each component is used per page and for styling/navigation conventions.
