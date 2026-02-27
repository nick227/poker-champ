# Table Loading Screen Redesign Proposal

## Summary
Replace the current fragmented table pre-load state (repeated "Connecting..." + duplicate "Return to lobby") with a single professional loading landing view that:
- Shows branded visual identity
- Uses one clear loading indicator
- Rotates a deterministic poker tip (stable during the loading session)
- Provides one clear escape action

## Problem Statement
Current status UI is visually and structurally fragmented:
- "Connecting..." appears in multiple regions (top bar, dealer bar, center card)
- "Return to lobby" appears in both center and bottom action area
- Layout feels like internal fallback state, not intentional product surface

This happens because `StatusTableView` currently renders status/action in 3 zones of `TableSceneShell` at once.

## Goals
- Ship a premium, intentional loading experience before table is ready.
- Keep users informed without noisy repeated text.
- Add lightweight value during wait via poker education tip.
- Preserve one clear fallback action without duplication.
- Stay compatible with existing table scene architecture.

## Non-Goals
- No server/API changes.
- No changes to active table gameplay UI.
- No heavy animation or long video assets.

## Single Loading Landing Rules
- Only one status line, inside the loading landing card.
- Only one escape action button visible at a time.
- No status text in dealer bar, bottom/action bar, or top chrome during status modes.

Action policy:
- Default: `Return to lobby`
- Auth required: `Go to login`

## Mode Mapping
- `auth_loading`
- Title: `Preparing your seat`
- Status: `Restoring your session...`
- Action: `Return to lobby`

- `auth_required`
- Title: `Session expired`
- Status: `Sign in to continue.`
- Action: `Go to login`

- `connecting`
- Title: `Preparing your seat`
- Status: `Connecting to table...`
- Action: `Return to lobby`

## UX Concept: Mini Landing Loading Page
A centered, full-height composition that behaves like a mini landing page while connection is establishing.

Visual structure:
1. Brand header
- Poker Champ mark (spade icon/logo) and wordmark.

2. Hero graphic area
- Static graphic or lightweight illustration (cards/chips/table motif).
- Subtle ambient glow; no heavy parallax.

3. Status + progress
- Single status line.
- Minimal loading indicator (3-dot pulse or thin indeterminate bar).

4. Poker tip card
- Label: `Pro Tip`
- One deterministic tip for session stability.

5. Single action row
- Exactly one CTA based on mode mapping.

## Proposed Components

### 1) `TableLoadingLanding`
Path: `apps/client/src/components/domain/table/loading/TableLoadingLanding.tsx`

Responsibilities:
- Own full loading layout composition.
- Render brand, hero graphic, status, indicator, tip, and single action.
- Accept mode-aware status props from scene.

Proposed props:
```ts
export type TableLoadingLandingProps = {
  mode: "auth_loading" | "auth_required" | "connecting";
  statusMessage: string;
  tableId?: string;
  onReturnToLobby: () => void;
  onGoToLogin?: () => void;
  reducedMotion?: boolean;
};
```

### 2) `TableLoadingGraphic`
Path: `apps/client/src/components/domain/table/loading/TableLoadingGraphic.tsx`

Responsibilities:
- Render lightweight branded visual (SVG/shape-based or static asset).
- Keep rendering cheap and responsive.

### 3) `PokerTipCard`
Path: `apps/client/src/components/domain/table/loading/PokerTipCard.tsx`

Responsibilities:
- Show one selected tip with stable layout.
- Optionally show category badge.

### 4) `loadingTips.ts`
Path: `apps/client/src/components/domain/table/loading/loadingTips.ts`

Responsibilities:
- Export curated tip list (10-20 high-signal poker tips).
- Provide deterministic helper: `getDeterministicTip(seed: string)`.

Implementation sketch:
```ts
export type Tip = {
  text: string;
  category?: "Preflop" | "Bankroll" | "Position" | "Mindset" | "Postflop";
};

export const TIPS: Tip[] = [
  // 10-20 tips
];

function hash32(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getDeterministicTip(seed: string): Tip {
  const idx = hash32(seed) % TIPS.length;
  return TIPS[idx];
}
```

Landing usage:
```ts
const tip = useMemo(() => getDeterministicTip(tableId ?? "session"), [tableId]);
```

### 5) `LoadingIndicatorMinimal`
Path: `apps/client/src/components/domain/table/loading/LoadingIndicatorMinimal.tsx`

Responsibilities:
- Small visual progress cue (dot pulse or bar).
- No spinner-heavy visual noise.
- Keep mounted across status text changes to avoid animation re-mount jank.

## Wiring Plan (Minimal Churn)

### Current behavior to replace
`StatusTableView` currently uses:
- `DealerAnnounceBar` with status text
- `ConnectingCard` with status + action
- `statusBottom(...)` with another action button

### New behavior
`StatusTableView` becomes a single-surface presenter while keeping `TableSceneShell`.

Render policy:
- `dealerBar`: neutral spacer, no text
- `board`: `<TableLoadingLanding ... />`
- `bottom`: `null` (or fixed spacer only if shell contract requires it)

Pseudo-shape:
```tsx
return (
  <TableSceneShell
    dealerBar={<View />}
    board={
      <TableLoadingLanding
        mode={mode}
        statusMessage={statusMessage}
        onReturnToLobby={onReturnToLobby}
        onGoToLogin={onGoToLogin}
        tableId={tableId}
        reducedMotion={reducedMotion}
      />
    }
    bottom={null}
  />
);
```

Key removal:
- Remove/disable `DealerAnnounceBar`, `ConnectingCard`, and `statusBottom(...)` for status modes.

## Styling Approach
Preferred:
- Keep styles scoped to loading UI classes, not global theme token expansion.

Recommended classes:
- `ui-loading-bg` (gradient + felt accent glow)
- `ui-loading-surface` (card)
- `ui-loading-title`
- `ui-loading-muted`

If CSS variables are needed, scope them to loading root only:
```css
.ui-loading-root {
  --loading-bg-start: ...;
  --loading-bg-end: ...;
  --loading-accent: ...;
}
```

## Motion and Performance Guardrails
- Indicator: 3-dot pulse or thin indeterminate bar.
- Do not re-mount indicator on status text updates.
- Reduced motion: disable fade/pulse loops and use static indicator treatment.
- No heavy raster/video assets; prefer vector/lightweight graphics.

## Poker Tip Pool (Starter)
- "Position is power: play more hands on the button, fewer out of position."
- "Protect your bankroll: avoid risking more than 5% in one cash game buy-in."
- "If a hand is good enough to call a big raise, consider whether it is strong enough to 3-bet."
- "Watch showdown hands. Opponents reveal patterns even when you are not in the pot."
- "Bluff less on multi-way pots; someone usually has enough to continue."
- "In heads-up pots, small continuation bets often achieve the same fold equity as large bets."
- "When tilted, tighten up for one orbit before opening your ranges again."
- "Count combos, not just hand names; range advantage decides many close spots."

## Accessibility and UX Quality
- Maintain WCAG-appropriate contrast for status/tip text.
- Respect reduced-motion preferences.
- Screen reader order: title -> status -> tip -> action.
- Keep one clear CTA to reduce cognitive load.

## QA Checklist
- Exactly one status line is visible in all loading modes.
- Exactly one action button is visible in all loading modes.
- Tip stays stable across re-renders/reconnect retries.
- Tip varies across different `tableId` values.
- Transition to active table leaves no phantom spacing artifacts.
- Reduced-motion mode has no continuous loops.
- Mobile and desktop layout both read as intentional and balanced.

## Gotchas to Handle Now
1. Shell height contracts
- If `TableSceneShell` reserves vertical space for dealer/bottom zones, loading content can look off-center.
- Mitigation: make `TableLoadingLanding` use `flex: 1` and center internally with compensating padding.

2. Auth-required action consistency
- To satisfy single-action acceptance criteria, auth-required mode uses only `Go to login`.
- `Return to lobby` is used only in non-auth-required modes.

## Rollout Plan
1. Implement new loading components under `table/loading`.
2. Update `StatusTableView` to single-surface presenter wiring.
3. QA with reconnect/auth-required/normal connecting flows.
4. Ship directly after verification.

## Acceptance Criteria
- Only one status message visible at a time.
- Only one action visible at a time.
- A branded graphic is visible in loading view.
- Deterministic tip is shown and stable during the loading session.
- Layout is intentional on mobile and desktop.
- No regressions when transitioning from loading to active table.

## Recommended Decisions
- Hero asset: in-app vector composition for MVP; swap later without API changes.
- Tip strategy: deterministic by `tableId` (fallback `"session"`) for stability + variety.
