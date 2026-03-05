## Table scene composition

This document captures how the table UI is currently composed so we can safely redesign/flatten the felt, community cards, dealer bar, and calculations/action areas without losing behavior.

### High–level structure

- **Single shell for all table states**
  - `TableSceneShell` is the only layout shell for table views (auth, connecting, idle, active).
  - Guardrail comment explicitly forbids introducing another shell.
  - All table UIs plug into this shell via props (`dealerBar`, `board`, `hero`, `bottom`, etc.).

- **Primary entry point for an active hand**
  - `ActiveTableView` is the main "playing" view for a live/replay hand.
  - It:
    - Receives `snapshot` (`TableSnapshotPayload`) and wiring props (opponents, balances, handlers).
    - Calls `useTableViewShellFrame` to derive:
      - A `TableSceneModel` (`model`) – all derived game state for the view.
      - `shellBaseProps` – props fed into `TableSceneShell` (top bar + opponent strip).
      - `board` – the current `CommunityBoard` React node.
    - Computes hero/turn-related UX state (turn countdown, pending hero action, sit-out/rebuy, notifications).
    - Chooses which **bottom section** to render (empty, sit-out CTA, rebuy, status message, or `ActionBar`).
    - Injects the children for `TableSceneShell`:
      - `dealerBar`: `DealerAnnounceBar`
      - `board`: `CommunityBoard` wrapped in `FeltBackground`
      - `hero`: `HeroZone` (includes calculations strip + hero cards/stack)
      - `bottom`: `ActionBar` or alternate CTA/status content.

### Data/model flow

- **Snapshot → model**
  - `useTableViewShellFrame` uses `useTableSceneModel(snapshot, handResultMessage, connectionStatus)` which:
    - Builds a `TableSceneModel` via `buildTableSceneModel`:
      - Derives seat context, hero status, whose turn it is.
      - Extracts:
        - `communityCards`, `heroCards`, `potCents`, `heroStackCents`.
        - Hero status/turn flags (`heroStatus`, `isHeroToAct`, `isHeroDealer`, `isHeroWinner`).
        - Hero meta (`heroName`, `heroAvatarUrl`, `heroPlayerStats`, `heroCalculations`).
        - Table meta (`tableName`, blinds, `playerCount`, `maxSeats`).
      - Builds `handSummary` (street + pot) and feeds it to the dealer bar.
      - Normalizes `heroActionOptions` (incl. merging call amount with hero stack).
      - Computes `actionContext` via `getActionContext`, which drives `ActionBar`.
  - `useTableViewShellFrame` then:
    - Creates `shellBaseProps` (top bar + opponent strip inputs) from `model` + `snapshot`.
    - Constructs `board` as `<CommunityBoard cards={model.communityCards} potCents={model.potCents} />`.

- **Model → view composition**
  - `ActiveTableView` destructures the `model` for:
    - `handSummary`, `actionContext`, `canAct`, `heroStatus`.
    - `communityCards`, `potCents`, `heroCards`, `heroStackCents`.
    - `heroActionOptions`, `heroCalculations`, `heroPlayerStats`.
    - `heroName`, `heroAvatarUrl`, `isHeroToAct`, `isHeroWinner`, `isHeroDealer`.
  - It then wires these pieces into:
    - `DealerAnnounceBar` (status messages & winner line).
    - `CommunityBoard` (board cards + pot, via `board` prop on shell).
    - `HeroZone` (hero cards, stack, calculations, stats, and hero identity).
    - `ActionBar` (action buttons + bet input + chips).

### Layout shell (`TableSceneShell`)

- **Responsibilities**
  - Owns **macro layout** and vertical contracts:
    - Top bar (table title + blinds + actions).
    - Opponent list.
    - Game area: dealer announce bar + felt/board.
    - Hero zone.
    - Bottom/action section.
  - Injects theme/layout tokens via `nativewind` `vars`:
    - Colors for felt, cards, accents, background, and table radius.
    - CSS var for hero zone height on web.
  - Uses `TableLayoutHeightProvider` / `useTableLayoutHeights` for dynamic hero zone height and safe-area insets.

- **Vertical band structure**
  - Backed by `layoutStyles` (`tableLayout.styles.ts`), which define **fixed-height** bands:
    - `titleSection`: fixed `LAYOUT_GAME_TOP_BAR_HEIGHT`.
    - `opponentStripSection`: auto height, no flex grow/shrink.
    - `mainContent`:
      - `gameArea` (`GAME_AREA_HEIGHT`):
        - `dealerBar` (`DEALER_BAR_HEIGHT`).
        - `feltArea` (`COMMUNITY_BOARD_HEIGHT`).
      - `heroSection`:
        - Height from `heroZoneHeight` (context) or constant `HERO_ZONE_HEIGHT`.
      - `actionBarSection`:
        - Height `ACTION_BAR_HEIGHT` + bottom inset (inside a `Surface`).
  - Only `mainContent` flexes vertically; all other bands maintain fixed heights. This is enforced by a guardrail comment.

- **Children injection**
  - Receives content via props:
    - `dealerBar` – typically `DealerAnnounceBar`.
    - `board` – usually `CommunityBoard` (felt + community cards).
    - `hero` – `HeroZone` (hero panel + calculations).
    - `bottom` – status CTA, rebuy button, or `ActionBar`.
  - Special mode: `immersiveBoard`
    - When `immersiveBoard` is true, it bypasses the normal vertical bands:
      - Fills the remaining space with `board` centered.
      - Skips opponent strip, hero, bottom sections.

### Key sub-areas

#### 1. Felt + community cards (board)

- **Components & data**
  - `CommunityBoard`:
    - Props: `cards: UiCard[]`, `potCents: number` (pot is not currently rendered in this component; it may be used later for overlays).
    - Computes orientation (`portrait`/`landscape`) from `useWindowDimensions`.
    - Uses `useIsMobile` to pick card gaps for mobile vs desktop.
    - Pulls `cardFacePackId` from `preferences` store.
    - Renders 5 card slots with stable keys for flop/turn/river.
  - Wrapped in `FeltBackground`:
    - Felt image, color, or gradient based on preferences.
    - Web-only gradients; native falls back to solid or simplified gradient color.

- **Layout & constants**
  - `COMMUNITY_BOARD_HEIGHT`, `COMMUNITY_BOARD_HEIGHT_LANDSCAPE`, `COMMUNITY_CARD_GAP_*`, `COMMUNITY_CARD_SCALE_*` drive:
    - Height of the felt band within `TableSceneShell.gameArea`.
    - Card spacing and scale across orientations and platforms.
  - `layoutStyles.feltArea` clamps height to `COMMUNITY_BOARD_HEIGHT`; landscape scaling happens inside `CommunityBoard`.

- **Composition notes**
  - The **felt** is not a top-level band; it is:
    - `TableSceneShell.gameArea` → `feltArea` → `CommunityBoard` → `FeltBackground` → cards.
  - Pot display is **not** tied to the felt visually here; pot is passed in but used elsewhere (e.g., in calculations/hero zone / action bar).

#### 2. Dealer bar (announce/status)

- **Component**
  - `DealerAnnounceBar`:
    - Sole owner of textual **game status** (connecting, error, waiting, action/hand result) per guardrail comment.
    - Inputs:
      - `hand` (street + pot).
      - `actionMessage`.
      - `handResultMessage`.
      - `tableStatus`.
      - `nextHandAtTs` (to show countdown to next deal).
      - Optional `statusMessage` (overrides derived message, e.g. for connection errors).
    - Logic:
      - Derives the displayed message based on hand/result/status in `deriveMessage`.
      - When `nextHandAtTs` is set, uses an interval to update a remaining-seconds countdown.
      - Chooses a `Surface` styleId based on whether a countdown is active (`highlight` variant when waiting for next hand).

- **Placement**
  - Injected into `TableSceneShell` via `dealerBar` prop.
  - Rendered inside `layoutStyles.dealerBar` band, above `feltArea`.

#### 3. Hero zone + calculations bar

- **Component**
  - `HeroZone`:
    - Props combine:
      - Cards + stack (`cards`, `stackCents`).
      - Actionability (`canAct`, `heroStatus`, `isActiveTurn`, `turnCountdownSeconds`).
      - Stats/calculations (`equity`, `potOdds`, `outs`, `playerStats`, `potCents`).
      - Identity (`userName`, `avatarUrl`, `isDealer`, `isWinner`).
      - Controls (`onAvatarPress`, `onToggleSittingOut`, `showStats`, `height` override).
    - Computes:
      - `zoneHeight` from `useTableLayoutHeight` / `HERO_ZONE_HEIGHT` / `height` prop.
      - Derived flags: `folded`, `inactive`, `statusLabel`, `isSittingOut`, `sitOutDisabled`.
      - `hasCalculations` and `calculationsVisible` (driving whether to show `CalculationsStrip` meaningfully).

- **Calculations bar**
  - `CalculationsStrip` (used inside `HeroZone`):
    - Receives:
      - `equity`, `potCents`.
      - VPIP/PFR and hand count from `playerStats`.
      - `visible` and `muted` flags (from `HeroZone`).
    - This is the **"calculations bar"** in the hero panel:
      - Always rendered to preserve layout height.
      - Visual prominence and tone controlled by `visible`/`muted`.

- **Layout**
  - Structured as:
    - Top row: calculations strip (metrics + stats).
    - Middle row: hero cards panel + hero stack/identity + dealer button.
    - Optional badges:
      - `turnCountdownSeconds` label when it is hero’s turn with a countdown.
      - "Sitting out" badge when hero is sitting out.
  - Placed into `TableSceneShell.heroSection`, which has fixed height but is dynamically set via layout context.

#### 4. Bottom section / Action bar

- **Behavioral wrapper in `ActiveTableView`**
  - `ActiveTableView` decides what appears in the bottom band (`bottom` prop of `TableSceneShell`) based on:
    - Hero seat state (`heroIsSeated`, `heroStatus`).
    - Whether hero is sitting out (`heroIsSittingOut`).
    - Rebuy eligibility (`canRebuy`, `onPressRebuy`).
    - Action opportunities (`heroActionOptions`, `actionContext.showActions`, `isPendingHeroAction`).
    - Global controls (`forceDisableActions`, `disabledActionMessage`).
  - Bottom states:
    - Not seated: info text ("You are not seated at this table.").
    - Sitting out: text + `Rejoin` button.
    - Rebuy: `Rebuy` button.
    - Waiting/disabled:
      - A text+spinner row driven by `useActiveTableNotification` and/or `forceDisableActions`.
    - Actionable: `ActionBar` with all controls for betting.

- **`ActionBar` component**
  - Inputs:
    - `actionContext` from `TableSceneModel` (`getActionContext`).
    - `heroStatus`.
    - `actionOptions` (hero’s allowed actions from snapshot).
    - `potCents`.
    - `onAction` callback.
  - Responsibilities:
    - Drives **all hero actions**:
      - Fold / Check / Call / Bet / Raise / All-in.
    - Uses `ActionContext` (wager config, allowed actions, capabilities) and `useWagerCalculations` to:
      - Compute bet bounds and pot-based suggestions (half-pot, pot, max).
      - Validate and normalize user-entered bet amounts.
    - UI structure:
      - Status row: hero action status ("Your turn", "You folded", etc.).
      - Primary buttons row: Fold, Check/Call (contextual label), Bet/Raise (contextual label with formatted amount).
      - Chips row: Min, Half-pot, Pot, All-in.
      - Bet input: numeric input bound to wager min/max, with `$` prefix.
      - Overlay: reconnecting mask when `actionContext.showReconnectingOverlay` is true.
  - Layout:
    - Internally uses `ACTION_BAR_HEIGHT` and sub-row height constants.
    - Outer height is further increased by safe-area inset inside `TableSceneShell`’s `Surface` wrapper.

### Composition summary (current shape)

- **Top band**: `TableGameTopBar` (inside `TableSceneShell`) – table name, blinds, buy-in, and top-bar right content.
- **Opponent list**: `OpponentStrip` – scrollable list of opponents, winner highlight, and per-opponent action/stack/card preview.
- **Game band**:
  - Dealer bar: `DealerAnnounceBar` – all textual game status/announcements.
  - Felt band: `CommunityBoard` inside `FeltBackground` – visual felt + 5 community card slots.
- **Hero band**: `HeroZone` – hero cards, stack, dealer button, and top-row `CalculationsStrip`.
- **Bottom band**: context-driven content:
  - Simple text/CTA states (not seated, sitting out, rebuy, waiting/processing).
  - Or full `ActionBar` (fold/check/call/bet/raise/all-in, chip shortcuts, bet input).

### Flattening & simplification opportunities (for redesign)

These are **not** changes yet, just observations to guide the structural redesign.

- **Clarify and flatten the "board + felt" responsibility**
  - Today:
    - Felt background is buried in `CommunityBoard` via `FeltBackground`.
    - Pot display lives outside the felt even though `potCents` flows through.
  - Opportunity:
    - Introduce a clearer "BoardArea" concept that:
      - Owns the felt background and board-level overlays (pot, side-pots, street label).
      - Hosts `CommunityBoard` as a pure "cards-only" child.
    - This would simplify moving felt/pot/overlays together as a single unit.

- **Make the calculations bar a first-class, isolatable component**
  - Today:
    - `CalculationsStrip` is welded into `HeroZone`’s top rail.
  - Opportunity:
    - Treat the "calculations bar" as a composable band that can be:
      - Reused or repositioned (e.g., between felt and hero, or next to dealer bar).
      - Styled independently from the hero identity panel.

- **Consolidate "status + actions" across dealer bar and bottom**
  - Today:
    - `DealerAnnounceBar` owns high-level game status.
    - Bottom status text (via `useActiveTableNotification`) owns turn/waiting prompts and disabled states.
  - Opportunity:
    - Define a clearer contract:
      - Dealer bar: game/hand state and timing (macro).
      - Bottom area: hero-specific prompts and allowed actions (micro).
    - Potentially flatten the conditional bottom states into a dedicated "BottomState" component that:
      - Encapsulates the branching for CTA vs `ActionBar`.
      - Exposes a simpler API to `ActiveTableView`.

- **Reduce hidden height contracts**
  - Several height constants live across:
    - `tableLayout.constants.ts`, `communityBoard.layout.ts`, `actionBar.layout.ts`, and `HERO_ZONE_HEIGHT`.
  - Opportunity:
    - Centralize vertical band definitions into a single source of truth and ensure subcomponents either:
      - Fully own their internal layout, or
      - Receive explicit band heights via props/context (avoiding implicit coupling).

- **Make table composition more declarative**
  - Today:
    - `ActiveTableView`:
      - Mixes model wiring, sound effects, notifications, and bottom-state branching.
      - Assembles the `TableSceneShell` children inline.
  - Opportunity:
    - Extract small, declarative sub-composers:
      - `renderDealerBar(model, snapshot, overrides)`.
      - `renderBoard(model, snapshot, layout)`.
      - `renderHeroZone(model, snapshot, layout)`.
      - `renderBottom(model, snapshot, notificationState)`.
    - Or move toward a configuration object that defines each band’s component and props, keeping `ActiveTableView` thinner.

Taken together, the current system is already fairly modular (shell + pluggable bands), but the responsibilities for felt/board, calculations, and hero/bottom states are cross-cutting. The redesign should aim to make each vertical band (dealer bar, felt/board, calculations, hero, bottom/actions) more independently own its behavior and styling via clearer props or context, while keeping `TableSceneShell` the single source of truth for vertical layout.

