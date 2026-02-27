# Lobby Page Redesign Proposal

## Summary
Refactor lobby game rows into rich, feed-style panels that feel premium on mobile and desktop. The redesign prioritizes scanability, creator identity, and high-information density without visual noise.

## Goals
- Replace flat game rows with panel cards that are easier to scan while scrolling.
- Improve readability and hierarchy for core decision data (stakes, seats, buy-in, activity).
- Add creator identity to each game panel (creator name and avatar).
- Create a high-quality mobile feed experience inspired by top consumer apps (clean rhythm, clear focal points, consistent spacing).
- Preserve fast join flow and minimize interaction friction.

## Current State (Reference)
- Lobby screen renders `GameTableRow` in a simple list: [apps/client/app/lobby.tsx](/c:/wamp64/www/poker-champ/apps/client/app/lobby.tsx).
- Row currently includes game name, players/seats, blinds, min buy-in, join, and optional delete: [apps/client/src/components/domain/lobby/GameTableRow.tsx](/c:/wamp64/www/poker-champ/apps/client/src/components/domain/lobby/GameTableRow.tsx).
- Lobby table model currently lacks creator display metadata (name/avatar), only `creatorId`: [apps/client/src/lib/lobbyTables.ts](/c:/wamp64/www/poker-champ/apps/client/src/lib/lobbyTables.ts).

## Design Direction
- Feed-first layout: each game is a panel with strong top section, compact metadata grid, and sticky action area.
- Crisp visual rhythm: fixed spacing scale, strong typographic hierarchy, consistent card proportions.
- Information-first beauty: density is high, but each section has clear purpose and predictable placement.
- Motion with restraint: subtle entrance and press states, no distracting animation loops.
- Premium feel through touch confidence and social identity, not decorative effects.

## Panel Anatomy (Per Game)
1. Header band
- Creator avatar (40-48 px), creator display name, optional verification badge.
- Relative freshness signal (for example: "updated 12s ago").
- Context tags (for example: `Cash`, `6-Max`, `Fast`).

2. Primary game line
- Game name as primary title.
- Stakes shown as a strong, legible pair (`$1 / $2`) with optional limit type.

3. Information block
- Seats: `4 / 6 seated` with occupancy bar.
- Buy-in range: min-max chips/currency.
- Avg pot (if available).
- Waitlist count (if available).

4. Status strip
- Real-time state pill (`Open`, `Filling`, `Almost Full`, `Running`).
- Joinability hint (`Min buy-in met` or `Need +$20`).

5. Action row
- Primary CTA: `Join Table`.
- Secondary actions minimized in MVP to avoid clutter.
- Keep delete action creator-only and visually de-emphasized.

## Premium UX Requirements
1. Use proportion, not color, for hierarchy
- Stakes are the largest and strongest text.
- Creator identity is medium emphasis.
- Stats are smaller and quieter.
- Do not depend on gray shades alone to signal importance.

2. Stable card heights
- Define fixed layout buckets from day one:
- `Base panel height` for current release.
- `Expanded panel height` reserved for future richer state.
- Prevents jank during realtime updates.

3. Subtle press feedback
- On press:
- Scale to `0.98`.
- Compress shadow/elevation.
- `120ms` ease-out timing.
- Gives tactile, high-quality response.

4. Intentional avatar fallback
- Avoid generic colored-initial circles.
- Use neutral background, strong initial glyph, and identical visual weight to uploaded avatars.

## Data Model Additions
Extend lobby row payload to support panel richness.

Required:
- `creatorName: string`
- `creatorAvatarUrl: string | null`
- `updatedAt: string`
- `avgPotCents?: number`
- `waitlistCount?: number`

Optional:
- `tableVariant?: string`

Notes:
- Keep `creatorId` for authorization logic.
- If creator profile is unavailable, render deterministic avatar fallback from creator id/name.
- Do not block redesign launch on advanced stats (`creatorReputation`, `handsPerHour`, `spectatorCount`, `tableSpeed`). Ship social identity first.

## Layout Specs
- Mobile width: full-bleed feed with 12 px side gutters.
- Panel corner radius: 14-16 px.
- Vertical panel spacing: 10-12 px.
- Touch targets: minimum 44 px height.
- Header and action rows stay single-line at common breakpoints.
- On tablet/desktop, keep card look but move to 2-column masonry/grid when width allows.

## Typography and Visual Hierarchy
- Title: semibold, highest contrast.
- Stakes: numeric emphasis with tabular figures for quick comparison.
- Supporting metadata: muted but readable contrast.
- Tags/pills: compact uppercase labels, consistent color meaning.
- Maintain strict contrast and no low-opacity text for critical numbers.

## Interaction Model
- Panel tap behavior:
- MVP: join directly.
- Future: open lightweight table details sheet.
- CTA tap behavior:
- Immediate optimistic state.
- Button text becomes `Joining...`.
- Button disabled during join request.
- `120ms` fade transition.
- Press effect:
- Scale to `0.98`.
- Shadow/elevation compress.
- No bounce animation.
- No cluttered inline button groups.

## Readability and Accessibility
- Respect dynamic text scaling; avoid clipping in header row.
- Ensure all critical values have text equivalents, not color-only meaning.
- Keyboard/focus traversal order: panel -> details -> join.
- Avatar and creator text include accessible labels.

## Performance and Real-Time Behavior
- Use list virtualization for long feeds.
- Stable panel height buckets to reduce layout thrash during updates.
- Batch lobby refresh updates and animate only changed fields.
- Defer non-critical media (avatar images) with lightweight placeholders.

## Scroll Feel Standards
- Cards must read as distinct objects, not spreadsheet rows.
- Keep vertical spacing strictly consistent between cards.
- Do not use thin divider lines between cards.
- Avoid harsh shadows; use soft, restrained elevation.
- Target a calm stacked-card feel similar to Apple Wallet.

## Proposed Component Refactor
- Keep `LobbyScreen` orchestration in place and replace row render target.
- Replace `GameTableRow` with `GameTablePanel`.
- Internal split:
- `GamePanelHeader`
- `GamePanelPrimaryLine`
- `GamePanelStats`
- `GamePanelFooter`
- Keep unchanged in phase 1:
- Join logic
- Delete logic
- Routing

## Desktop Strategy
- Keep the exact same visual language and card proportions.
- Switch layout only:
- 2-column grid at approximately `768px+`.
- 3-column grid at approximately `1200px+`.

## Technical Implementation Plan (Final Pass)
1. Backend contract update
- Extend `LobbyTableSummary` shape in [src/lobby/types.ts](/c:/wamp64/www/poker-champ/src/lobby/types.ts):
- `creatorName: string`
- `creatorAvatarUrl: string | null`
- `updatedAt: number | string` (pick one contract type and keep consistent)
- `avgPotCents?: number`
- `waitlistCount?: number`
- Emit these fields in `/api/lobby/tables` response in [src/http/LobbyRouter.ts](/c:/wamp64/www/poker-champ/src/http/LobbyRouter.ts) from room metadata.
- Add schema fields to OpenAPI in [src/http/openapi.ts](/c:/wamp64/www/poker-champ/src/http/openapi.ts), then regenerate SDK types in `packages/sdk`.

2. Source of truth for creator identity
- At table creation, persist creator display data into room metadata once.
- Prefer `displayName` and `avatarUrl` from authenticated user (`req.user`) to avoid per-request join lookups.
- Fallback contract if missing:
- `creatorName = \"Player\"`
- `creatorAvatarUrl = null`
- Keep `creatorId` unchanged for authorization checks (delete ownership).

3. Client model and normalization
- Extend `LobbyTableRow` and `normalizeTable` in [apps/client/src/lib/lobbyTables.ts](/c:/wamp64/www/poker-champ/apps/client/src/lib/lobbyTables.ts) to include new fields.
- Keep parser resilient to partial payloads:
- Required identity fields should still have safe defaults.
- Optional stats should remain `undefined` when absent.
- Update tests in [lobbyTables.normalize.test.ts](/c:/wamp64/www/poker-champ/apps/client/src/tests/lobbyTables.normalize.test.ts) for new normalization behavior.

4. Replace row with panel component
- Replace `GameTableRow` mapping in [apps/client/app/lobby.tsx](/c:/wamp64/www/poker-champ/apps/client/app/lobby.tsx) with `GameTablePanel`.
- Add new components under `apps/client/src/components/domain/lobby/`:
- `GameTablePanel.tsx`
- `GamePanelHeader.tsx`
- `GamePanelPrimaryLine.tsx`
- `GamePanelStats.tsx`
- `GamePanelFooter.tsx`
- Keep existing join modal, delete flow, and routing unchanged in MVP.

5. Interaction and animation implementation
- CTA tap:
- Set local loading state for target table id.
- Transition button text to `Joining...`.
- Disable CTA immediately.
- Apply `120ms` opacity fade.
- Press feedback on panel/CTA:
- Scale transform `0.98`.
- Compress shadow/elevation.
- No spring/bounce easing.
- Ensure optimistic state clears on success and on error.

6. Layout and responsiveness
- Replace simple vertical row stack with card list spacing tokens.
- No divider lines between cards.
- Preserve fixed `Base panel height` in MVP.
- At `>=768px`, render two columns; at `>=1200px`, render three columns while keeping card internals identical.

7. Delete action constraints
- Delete affordance only when `table.creatorId === currentUserId` and `connectedHumanCount === 0` (existing logic).
- Move delete trigger into subtle overflow placement in panel footer.
- Do not expose delete control for non-creator users.

8. Validation and regression gates
- Unit:
- `normalizeTable` new fields and fallbacks.
- Panel rendering with missing avatar and missing optional stats.
- Interaction tests for `Joining...` optimistic state and disabled CTA.
- Integration/manual:
- Lobby join flow unchanged end-to-end.
- Creator-only delete unchanged end-to-end.
- Realtime refresh does not cause card height jumps.
- Responsive checks on small phone, large phone, tablet, desktop.

9. Delivery sequence
- PR 1: backend contract + OpenAPI + SDK generation.
- PR 2: client model + normalization + tests.
- PR 3: `GameTablePanel` swap with MVP interactions and responsive grid.
- PR 4: polish (skeletons, avatar fade-in, filters as Phase 2).

## Phase 2 Feed Enhancements
- Pinned filter chips near top.
- `Tables from creators you follow`.
- Sort options by `Activity`, `Open seats`, and `Stakes`.
- Skeleton loading cards.
- Fade-in avatars.

## Quality Guardrails
- Avoid overusing pills and badges.
- Avoid too many micro-stats on the first panel view.
- Do not mix font sizes inconsistently.
- Prevent unpredictable metadata wrapping.
- Hide zero-value stats instead of displaying `0`.
- Avoid stacked/shallow shadows that make cards look muddy.

## Removed From MVP
- Creator reputation badges.
- Spectator count.
- Dense multi-column stat grids.
- Multiple visible CTA buttons per card.
- Inline delete button visible for non-creators.

Delete action in MVP:
- Render only for table creator.
- Keep visually subtle and small.
- Prefer overflow menu placement over prominent inline placement.

## YouTube-Level Criteria
- Clean vertical rhythm.
- Clear primary number (stakes).
- Consistent spacing and typography.
- Social identity prominence (creator).
- High-confidence touch interactions.

## Success Metrics
- Higher join conversion from lobby impressions.
- Increased average scroll depth on lobby feed.
- Reduced time-to-first-join.
- Reduced mis-taps and bounce from lobby screen.
- Higher table exploration and creator return behavior.

## Expected Behavioral Shift
Users stop scanning rows like a spreadsheet and start scanning by:
- Stakes
- Creator
- Table energy (seats/activity)
- Buy-in accessibility
- Social signal

## Open Questions
- Do we already have creator profile data in the lobby endpoint, or must we add it server-side?
- Do we want a lightweight table details sheet before join, or direct join as default?

## Recommendation
Start with a backward-compatible `GameTablePanel` replacement for the existing row loop, ship creator avatar/name first, then layer advanced stats and filtering. This achieves an immediate visual and readability upgrade without blocking on deep backend changes.
