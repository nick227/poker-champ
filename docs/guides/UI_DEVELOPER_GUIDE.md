# UI Developer Guide

Guide to the client UI: code analysis, component inventory by page, and conventions for adding or changing screens and components.

---

## 1. UI Code Analysis

### 1.1 Structure

- **Routes** (expo-router): `app/*.tsx` and `app/table/[id].tsx`. Root `_layout.tsx` wraps all screens in `AppShell` and runs `bootstrapSdk()`.
- **Three component layers:**
  - **Base** (`src/components/base/`): Primitives (Text, Button, Input, Slider, Toggle, Pill, Badge, Loader, Layout, etc.). No domain logic.
  - **Containers** (`src/components/containers/`): Structural (AppShell, Screen, BottomBar, ModalSheet, TopBar, ListItem). Layout and chrome.
  - **Domain** (`src/components/domain/`): Feature-specific. `lobby/` (Masthead, ProfileStrip, BankrollDisplay, GameListHeader, GameTableRow, CreateGameModal, ChooseTableModal, EmptyState), `table/` (TableLayout and all table UI), `loading/` (LoadingScreen).
- **Screens** compose: `Screen` + domain blocks + optional `BottomBar`. Modals and overlays are domain components that use `ModalSheet` or RN `Modal`.

### 1.2 Styling

- **Tokens**: `src/theme/tokens.css` (colors, spacing, radius). Tailwind theme in `tailwind.config.js` extends these (e.g. `bg-bg`, `text-brand`, `border-gold-soft`).
- **Utility classes**: Plugin adds `ui-*` (e.g. `ui-surface`, `ui-row`, `ui-section`, `ui-border-b`, `ui-touch`, `ui-stack-*`, `ui-inline-*`, `ui-p-*`). Use these for consistency; avoid ad-hoc margins where a token/utility exists.
- **No shadows** per spec; dark theme with green/gold accents. WCAG contrast: primary text on `bg-bg`/`bg-panel`; use `text-text` on brand/danger for buttons and badges.

### 1.3 Patterns

- **Screen shell**: Every content screen uses `<Screen>` (SafeAreaView + bg + padding). Lobby, Table, and Settings also use `<BottomBar active="…" />` and share Masthead + ProfileStrip where applicable.
- **Modals**: Create Game, Choose Table, Chat, Player History use `ModalSheet` (slide-up + backdrop). Active Tables uses RN `Modal` + backdrop for a dropdown-style overlay.
- **Lists**: Lobby game list is `GameTableRow` per item; table list in Active Tables is a ScrollView of Pressables. No generic `DataTable` in the inventory; rows are domain components.
- **State**: Screens use local `useState` for modals and UI state; data from `storeRegistry` (auth, lobby, tables) and hooks (`useBankroll`, `useProfile`). No global UI store.

### 1.4 Consistency

- Copy: `src/constants/copy.ts` (APP_NAME, TABLE.*, MODAL.*, CHAT.*, etc.). Use these instead of hardcoded strings.
- Formatting: `formatCents()` from `@/lib/format` for currency.
- Navigation: `tablePath(id)`, `lobbyPath()` from `@/lib/nav`.
- Touch targets: `ui-touch` for 44pt minimum where applicable.

---

## 2. Component Inventory by Page

### 2.1 Root layout (`app/_layout.tsx`)

| Component | Role |
|-----------|------|
| AppShell | Wraps Stack; provides bg, Toast, optional DEV transport badge |
| (expo) Stack, StatusBar | Navigation, status bar style |

---

### 2.2 Index (`app/index.tsx`)

| Component | Role |
|-----------|------|
| Redirect | Auth-based redirect; no UI components |

---

### 2.3 Login (`app/login.tsx`)

| Layer | Components |
|-------|------------|
| Container | Screen |
| Base | Text, Input, PasswordInput, Button |
| Inline | View, Pressable (layout + links) |

No domain components. Form is inline with base primitives.

---

### 2.4 Loading (`app/loading.tsx`)

| Layer | Components |
|-------|------------|
| Domain | LoadingScreen |

**LoadingScreen** uses: View, Text, Loader.

---

### 2.5 Lobby (`app/lobby.tsx`)

| Layer | Components |
|-------|------------|
| Container | Screen, BottomBar |
| Domain (lobby) | Masthead, ProfileStrip, BankrollDisplay, GameListHeader, GameTableRow, EmptyState, CreateGameModal, ChooseTableModal |
| Domain (table) | TableNotificationBell, ActiveTablesDropdown |
| Base | Button, Text, Loader |

**Masthead**: Text.  
**ProfileStrip**: View, Text.  
**BankrollDisplay**: View, Text.  
**GameListHeader**: View, Button.  
**GameTableRow**: View, Text, ConfirmButton.  
**EmptyState**: View, Text.  
**CreateGameModal**: ModalSheet, View, Input, Button.  
**ChooseTableModal**: ModalSheet, View, Text, Slider, Button, ChipButton, Toggle.  
**TableNotificationBell**: Pressable, View, Text, Icon.  
**ActiveTablesDropdown**: Modal, Pressable, ScrollView, View, Text (no ModalSheet).

---

### 2.6 Table (`app/table/[id].tsx`)

| Layer | Components |
|-------|------------|
| Container | Screen, BottomBar |
| Domain (table) | MultiTableTabs, TableLayout, HandResultOverlay, ChatOverlay, PlayerHistoryPopup |
| Base | Button, IconButton, Icon, View |

**MultiTableTabs**: View, Pressable, Text.  
**TableLayout** (see below).  
**HandResultOverlay**: Modal, Animated.View, Text, Button, PlayingCard, PotWinRing.  
**ChatOverlay**: ModalSheet, View, ScrollView, Text, TextInput, Pressable, Icon.  
**PlayerHistoryPopup**: ModalSheet, View, Text.

**TableLayout** children:

| Component | Children (base/domain) |
|-----------|------------------------|
| TableTopBar | View, Text |
| OpponentStrip | View, Pressable, Text |
| DealerAnnounceBar | View, Text |
| CommunityBoard | View, PlayingCard, PotChipStack |
| HeroZone | View, Text, PlayingCard, CalculationsStrip |
| ActionBar | View, Text, Button, ChipButton, Slider, FadeTransition |

**CommunityBoard**: PlayingCard, PotChipStack.  
**HeroZone**: CalculationsStrip, View, Text, PlayingCard.  
**CalculationsStrip**: View, Pill (Pill uses Text).  
**ActionBar**: Text, Button, ChipButton, Slider, FadeTransition.

---

### 2.7 Settings (`app/settings.tsx`)

| Layer | Components |
|-------|------------|
| Container | Screen, BottomBar |
| Domain (lobby) | Masthead, ProfileStrip |
| Base | View, Text, Toggle, Button |

---

### 2.8 Cross-cutting (used by AppShell)

| Component | Role |
|-----------|------|
| Toast | Shown by AppShell from toast store |

---

## 3. Base Component Quick Reference

| Component | Typical use |
|-----------|-------------|
| Text | All text; variants: h1, h2, body, muted, label, danger |
| Button | primary, ghost, danger |
| IconButton | icon + onPress |
| ChipButton | Segmented options (e.g. Fast/Normal, 3/6) |
| ConfirmButton | Join / confirm CTAs |
| Input, PasswordInput | Form fields |
| Slider | Numeric range (buy-in, bet) |
| Toggle | Boolean preference |
| Pill | Label + value (e.g. Equity 42%) |
| Badge | Status chips |
| Loader | Spinner |
| Layout (Row, Column, Spacer, Divider) | Structure; prefer ui-* where it fits |
| Panel, Card | Wrappers; prefer ui-surface, ui-surface-card |
| FadeTransition | Show/hide with opacity animation |
| Icon | Named icon from Icons set |

---

## 4. Adding or Changing UI

### 4.1 New screen

1. Add route: `app/<name>.tsx` (or `app/<folder>/[param].tsx`).
2. Use `<Screen>{content}</Screen>`. Add `<BottomBar active="…" />` if it’s a main tab; register in `screen.registry.ts` (path, authRequired, bottomBarLabel).
3. Compose from domain + base; avoid one-off layout that belongs in a shared component.

### 4.2 New domain component

1. Place under `src/components/domain/<feature>/` (e.g. `lobby/`, `table/`).
2. Use base + containers only; use `ui-*` and token classes.
3. Use copy from `@/constants/copy`, `formatCents`/`tablePath`/etc. where relevant.

### 4.3 New base component

1. Place in `src/components/base/<Name>.tsx`.
2. Keep it presentational; accept props only (no store/API imports unless it’s a single-purpose hook like usePlaySound).
3. Use design tokens and existing base components where it makes sense.

### 4.4 Modals and overlays

- **ModalSheet**: Slide-up sheet with title and close. Use for forms and detail views (Create Game, Choose Table, Chat, Player History).
- **RN Modal**: Use for custom overlay behavior (e.g. Active Tables dropdown with different dismiss behavior).

### 4.5 Styling rules

- Prefer `className` with Tailwind + `ui-*`; use `style` only when dynamic (e.g. Animated, or layout that cannot be expressed in classes).
- Section spacing: `ui-section` or `ui-section-tight` for consistent padding and border.
- Touch targets: `ui-touch` for buttons/controls that must be >=44pt.
- Button rule: keep `Button` layout-neutral. Put spacing (`gap-*`, `mt-*`, etc.) on the parent container, not on individual button instances.
- Pressable rule: if a `Pressable` is acting as a semantic action/button, style it with `btn-*` utilities instead of ad-hoc `px/py/bg/rounded` classes.
---

## 5. File Map

```
app/
  _layout.tsx      → AppShell, Stack
  index.tsx        → Redirect
  login.tsx        → Screen, Text, Input, PasswordInput, Button
  loading.tsx      → LoadingScreen
  lobby.tsx        → Screen, Masthead, ProfileStrip, BankrollDisplay, GameListHeader,
                     GameTableRow, EmptyState, CreateGameModal, ChooseTableModal,
                     TableNotificationBell, ActiveTablesDropdown, BottomBar, Button, Loader, Text
  table/[id].tsx   → Screen, BottomBar, MultiTableTabs, TableLayout, HandResultOverlay,
                     ChatOverlay, PlayerHistoryPopup, Button, IconButton, Icon
  settings.tsx     → Screen, Masthead, ProfileStrip, BottomBar, Text, Toggle, Button

src/components/
  base/            → Text, Button, IconButton, ChipButton, ConfirmButton, Input, PasswordInput,
                     Slider, Toggle, Pill, Badge, Loader, Layout, Panel, Card, FadeTransition, Icons
  containers/      → AppShell, Screen, BottomBar, ModalSheet, TopBar, ListItem
  domain/
    lobby/         → Masthead, ProfileStrip, BankrollDisplay, GameListHeader, GameTableRow,
                     EmptyState, CreateGameModal, ChooseTableModal
    table/         → TableLayout, TableTopBar, OpponentStrip, DealerAnnounceBar, CommunityBoard,
                     HeroZone, CalculationsStrip, ActionBar, PlayingCard, PotChipStack,
                     PotWinEffect, TableNotificationBell, MultiTableTabs, ActiveTablesDropdown,
                     HandResultOverlay, ChatOverlay, PlayerHistoryPopup, StatChip
    loading/       → LoadingScreen
```

---

## 6. References

- **Design tokens**: `src/theme/tokens.css`, `tailwind.config.js`
- **Copy**: `src/constants/copy.ts`
- **Navigation**: `src/lib/nav.ts`
- **Format**: `src/lib/format.ts`
- **Screens / auth**: `src/registry/screen.registry.ts`
- **Implementation checklist**: `UI_IMPLEMENTATION_CHECKLIST.md`
- **Component design**: `UI_COMPONENT_DESIGN.md`
