# Instant Game Implementation Plan

## Decision
Ship Option A now (client-orchestrated seeding), implemented with idempotent and owner-guarded seeding to avoid reliability debt.

## Objective
Add two persistent, half-size instant game panels at the top of the lobby feed:
- `6-Bot` game (player + 5 bots at a 6-seat table)
- `Heads-Up Bot` game (player + 1 bot at a 2-seat table)

Each panel should create a new table, join the player, auto-add bots, and allow the game to appear in the normal active-game river using the existing random table naming flow.

## Product Requirements (MVP)
- Panels are always visible at top of feed (below lobby header, above active games).
- One tap does all setup work.
- Created tables remain standard public tables and show up in `/api/lobby/tables` like normal games.
- Keep existing random table naming (`getRandomTableName`).
- No new user flow screens for MVP.

## Optional Product Enhancement: Social Proof Signal
Add a lightweight activity line under each instant panel, for example:
- `23 players currently in 6-Bot games`
- `11 players currently in Heads-Up bot games`

Why:
- Perceived activity
- Confidence to tap
- Social proof

Low-cost implementation path:
- Tag instant-created tables with preset metadata (for example `instantPreset`).
- Aggregate connected human counts by preset from lobby room metadata.
- Expose counts to lobby UI and render as subtle helper text beneath each panel CTA.
- Keep hidden when count is `0` or unavailable.

## MVP Architecture (Components + Responsibilities)
### Lobby
- `InstantGamePanels` (new)
  - Pure UI.
  - Emits `startInstantGame(presetId)` events.
  - Shows `Starting...` and disables per-card CTA while in flight.

- `startInstantGame(presetId)` in `lobby.tsx`
  - Creates table via existing API.
  - Navigates to `/table/[id]?buyInCents=...&instantPreset=...&seedNonce=...`.
  - Does not seed bots in lobby.

### Table
- `useInstantBotSeeder` (new)
  - Owns seeding orchestration because table page has realtime readiness state.
  - Applies creator-only guard, idempotent missing-bot calculation, rate-limited adds, and completion lock.

## Panel Design + Copy

### Layout
- Render as a 2-up row of half-width cards (`50% - gap`) pinned at top of feed content.
- Card height target: `120-140px`.
- Keep them visually distinct from normal game panels with subtle gradient header + icon.
- On narrow mobile widths, maintain 2-up if touch targets remain >=44px; otherwise stack to 1-up.

### Panel 1: 6-Bot Ring
- Eyebrow: `Instant Game`
- Title: `6-Bot Ring`
- Body: `Start a full table instantly. We create a public 6-seat game, seat 5 bots, and drop you in.`
- Meta line: `You + 5 bots | Random table name`
- CTA: `Start 6-Bot Game`
- Helper copy under CTA: `One tap: create, join, and auto-fill`

### Panel 2: Heads-Up Bot
- Eyebrow: `Instant Game`
- Title: `Heads-Up Bot Duel`
- Body: `Warm up fast in a heads-up battle. We create a public 2-seat game with one bot and seat you immediately.`
- Meta line: `You + 1 bot | Random table name`
- CTA: `Start Heads-Up`
- Helper copy under CTA: `One tap: create and play`

## Minimum Code Change Path (Recommended MVP)
Use existing APIs and realtime messages; avoid backend contract changes.

### Why this is minimal
- Table creation already exists (`postCreateTable`).
- Player join already exists (`openTable` + `tablePath(...buyInCents)`).
- Bot add already exists (`dispatchAddBot` via `ADD_BOT` message).
- Lobby river inclusion already exists (`/api/lobby/tables` + refresh loop).
- Seeding remains on the table page (where realtime readiness already lives), not lobby.

### MVP flow
1. User taps instant panel in lobby.
2. Client creates a table with preset config and random name.
3. Client navigates to table route with `buyInCents`, `instantPreset`, and `seedNonce`.
4. Table screen runs one-time guarded seeding logic.
5. Seeder waits until session is connected and hero is seated, computes missing bots, and only adds missing.
6. Table naturally appears in lobby river as a normal active game.

## Safe-to-Seed Rules (Must-Have)
1. Creator-only guard
- Seed only when current player is table creator.
- Authoritative field: `snapshot.table.creatorId` (or `table.creatorId` if that is the canonical snapshot path).
- If creator id is not currently present in snapshot/welcome payload, add it as a small contract change in MVP.
- Fallback gate (if snapshot creator is unavailable): local "table created by me" memory paired with `seedNonce`.

2. Live + seated gate
- Require:
  - `connectionStatus === CONNECTED`
  - `hero.youAreSeated === true`
  - `hero.seat != null`

3. Idempotent target count
- Compute `missing = targetBots - currentBotCount`.
- Add only `missing` bots (never blindly add target each run).
- Count bots from `botSummaries` and/or snapshot seat occupants with `kind === BOT`.

4. Rate-limited add loop
- Add bots sequentially with short spacing (`150-300ms`) or wait for bot list/snapshot confirmation between adds.

5. Completion lock per seed nonce
- Persist completion marker in memory + `sessionStorage` for reload safety in the same tab.
- Key format: `instantSeedDone:${tableId}:${seedNonce}`.
- Never seed when preset is missing or marker already complete.

## Proposed Presets
- `SIX_BOT_RING`
  - `maxSeats: 6`
  - target bot count: `5`
- `HEADS_UP_BOT`
  - `maxSeats: 2`
  - target bot count: `1`

Shared values for MVP:
- `visibility: PUBLIC`
- `name: getRandomTableName()`
- blinds/min/max buy-in from current defaults (or product-selected fixed instant stakes)
- Product intent note:
  - Current `6-Bot Ring` is player + 5 bots (full table, instant action).
  - This is not optimized for inviting additional humans into that same table.
  - If growth intent shifts to "open seats for joiners," use player + 4 bots or split later into `Full Ring` vs `Open Seats`.

## Concrete File-Level Changes (MVP)
1. `apps/client/app/lobby.tsx`
- Render new `InstantGamePanels` above feed list.
- Add `startInstantGame(presetId)` that calls `postCreateTable` and routes with `instantPreset` + `seedNonce`.
- Keep seeding out of lobby.
- Add explicit anti-double-tap lock:
  - `instantStartInFlightPreset: presetId | null`
  - Clear lock on success, error, and timeout (same resilience pattern as join state).

2. `apps/client/src/components/domain/lobby/InstantGamePanels.tsx` (new)
- Presentational 2-card component with copy, CTA, and loading/disabled state.

3. `apps/client/src/components/domain/lobby/instantGame.presets.ts` (new)
- Preset constants and config builder for `postCreateTable`.

4. `apps/client/src/lib/nav.ts`
- Extend table navigation helper to support optional `instantPreset` and `seedNonce` query params.

5. `apps/client/app/table/TablePage.tsx`
- Read optional `instantPreset` and `seedNonce` from route params.

6. `apps/client/app/table/useTablePageController.tsx`
- Wire `instantPreset` and `seedNonce` into a new seeding hook.
- Pass creator/snapshot/realtime inputs needed for safe-to-seed gating.

7. `apps/client/src/components/domain/table/hooks/useInstantBotSeeder.ts` (new)
- One-time guarded auto-seeding logic using existing `dispatchAddBot`.
- Uses `dispatchListBots`/`botSummaries` to compute current bot count.
- Applies creator-only guard, idempotent missing calculation, rate-limited add loop, and completion lock by `tableId + seedNonce`.
- Deterministic pacing method:
  - Add one bot -> wait for bot count increment OR `250ms` timeout -> continue.
  - Retry cap: max `2` retries per bot add attempt.

## Test Plan (MVP-targeted)
1. Unit tests for `useInstantBotSeeder`
- Seeds only when connected + seated + creator.
- Does not seed twice with same `(tableId, seedNonce)`.
- Adds only missing bots.
- Skips seeding for non-creator.
- Non-creator abuse-case must-have:
  - second user opens same table with `instantPreset`/`seedNonce` in URL
  - assert `dispatchAddBot` is never called.

2. Integration-ish state progression test
- Simulate transitions: not seated -> seated -> bot list grows.
- Assert `dispatchAddBot` called exact expected count.

## Known MVP Risks and Mitigations
- Risk: re-seeding on reload/reconnect.
  - Mitigation: creator-only guard + idempotent missing-bot calc + `tableId + seedNonce` completion marker.

- Risk: two humans seed same table.
  - Mitigation: creator-only guard. (Current MVP always creates a new table per tap, so race is minimal.)

- Risk: 6-bot mode leaves no seat for extra humans.
  - Mitigation: product choice for MVP.
  - Current behavior: full table vibe (player + 5 bots).
  - Optional later variant: open-seat mode (player + 4 bots at 6-max).

## Guardrails
- Prevent duplicate create taps with in-flight lock per panel.
- If bot seeding partially fails, keep user in table and show toast (`Added 3/5 bots`).
- Keep instant tables public so they enter river naturally.
- Keep creator ownership semantics unchanged.
- Keep CTA width/text stable (`Starting...`) to avoid layout shift.
- Standardized UX messaging:
  - Seeding: `Setting up table... Adding bots (2/5)`
  - Partial: `Table ready - added 3/5 bots`
  - Failure: `Couldn't add bots. You can add them manually.`
  - On failure, keep add-bot affordance visible as recovery path.

## Validation Checklist
- Panel renders at top and remains visible during lobby refresh.
- One tap creates and navigates correctly.
- User joins with valid buy-in (no join schema errors).
- `SIX_BOT_RING` reaches player+5 bots; `HEADS_UP_BOT` reaches player+1 bot.
- Created table appears in active-game feed.
- Retry path works on network/create failures.
- Reload/reconnect does not re-seed completed preset for same `tableId + seedNonce`.

## Optimal Game-Building Process (Post-MVP)
After MVP proves demand, move to a server-orchestrated instant flow for stronger reliability.

### Phase 2 architecture
- Add `POST /api/lobby/instant-games` endpoint that:
  - Validates preset (`SIX_BOT_RING`, `HEADS_UP_BOT`)
  - Creates table with random name server-side
  - Seeds bots server-side
  - Stores preset metadata
- Endpoint returns `{ tableId, roomId, buyInSuggestionCents }`.
- Client only navigates/joins.

### Benefits
- Fewer client timing/race concerns.
- Bot composition consistency.
- Cleaner analytics and A/B testing per preset.

## Delivery Sequence
1. UI scaffold: `InstantGamePanels` + lobby placement.
2. Instant create/join handlers in lobby.
3. Route param plumbing (`instantPreset`, `seedNonce`).
4. One-time bot seeding hook on table page.
5. QA pass + telemetry wiring.

## Telemetry Events (MVP)
- `instant_game_tap` `{ presetId }`
- `instant_game_created` `{ tableId, presetId }`
- `instant_game_joined` `{ tableId }`
- `instant_game_seed_start` `{ tableId, presetId, targetBots }`
- `instant_game_seed_result` `{ addedBots, targetBots, durationMs, ok }`

## Out of Scope (MVP)
- New backend instant endpoint.
- Custom stake picker inside instant panels.
- Bot difficulty picker.
- Instant private tables.
