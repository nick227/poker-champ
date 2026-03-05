# Authorization Review and Guest Gating (March 2026)

## Current System Review (Before Changes)

### Frontend user tracking
- Auth state is tracked in `apps/client/src/stores/auth.store.ts`.
- Fields:
  - `token: string | null` (session bearer token)
  - `hydrated: boolean` (token hydration complete flag)
- Startup flow (`apps/client/src/bootstrap/sdk.ts`):
  - hydrate token from secure storage/localStorage
  - set SDK auth token context
  - optionally call `/api/auth/me` and populate profile store
  - mark auth store as hydrated

### Guard behavior before this change
- `/table/[id]` already had explicit login redirect via `loginPathWithNext(...)`.
- `/settings` had no route-level guard and could render guest-facing sections with partial/empty data.
- `BottomBar` and `AppTopNav` always pushed to `/settings`.
- Lobby `New Game`/instant game actions attempted authenticated APIs directly, causing raw 401-style errors for guests.
- Root default route for logged-out users was `/login`.

### Backend auth perimeter (relevant)
- `GET /api/lobby/tables` is public (guest-safe).
- `POST /api/lobby/tables` and `POST /api/lobby/instant-games` require auth (`requireAuth`).
- `requireAuth` returns 401 for missing/invalid bearer token.

## Plan Executed
1. Preserve guest access to lobby browsing.
2. Add hard protection for Settings route.
3. Gate New Game creation paths for guests with login/register redirect (no raw auth error dead end).
4. Route "You" entry points to login/register for guests.
5. Add login/register CTA in auth-error UI where users can get stuck.
6. Validate with typecheck + focused tests.

## Implementation Summary
- Guest default route now lands on `/lobby`.
- `screenRegistry.lobby.authRequired` updated to `false` for policy alignment.
- `/settings` now redirects unauthenticated users to `/login?next=/settings`.
- `BottomBar` and `AppTopNav` now send guests pressing "You" to login/register instead of settings.
- Lobby actions now gate auth before create/start/join actions:
  - New Game button routes guests to login/register.
  - Instant game start routes guests to login/register.
  - Join action routes guests to login/register with table next path.
- Leaderboard auth-error panel now includes `Login / Register` CTA to avoid dead-end error-only state.

## Guest vs Logged-in Behavior (After Changes)
- Guest:
  - Can enter and view lobby.
  - Cannot open settings; redirected to login/register.
  - Cannot start New Game/instant game; redirected to login/register.
  - Can click "You" in bottom bar/top nav and is redirected to login/register.
- Logged-in:
  - Unchanged for normal lobby/settings/game creation flows.

## Validation
- `pnpm -C apps/client typecheck` passed.
- `pnpm --prefix apps/client exec vitest run src/tests/screen.registry.test.ts` passed (updated for guest default route behavior).
