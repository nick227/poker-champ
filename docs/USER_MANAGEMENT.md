# User Management: Auth, Registration, and Persistence

## Scope
This document describes the current user management strategy for:
- Registration
- Login/session lifecycle
- User persistence in MySQL/Prisma
- How identity ties into poker gameplay
- Where Colyseus is involved

## High-level architecture
- HTTP auth is handled by Express routes under `/api/auth`.
- Sessions are persisted in `UserSession` rows and validated on each authenticated request.
- Game runtime uses Colyseus rooms (`lobby`, `poker`), with auth enforcement in `PokerRoom.onAuth`.
- Financial/accounting persistence is split between:
  - `User.bankrollCents` (wallet-level)
  - `PlayerBalance` + `BalanceTransaction` (table/in-hand ledger-level)

## Registration strategy
- Endpoint: `POST /api/auth/register`.
- Flow:
  1. Validate `email` + `password`.
  2. Validate/allocate public `username` (handle).
  3. Reject duplicate email.
  4. Hash password with `bcryptjs` (cost 12).
  5. Create `User` row.
  6. Create a `UserSession` token.
  7. Return `{ token, user }` with sanitized user data (no `passwordHash`).

## Login strategy
- Endpoint: `POST /api/auth/login`.
- Flow:
  1. Validate credentials against stored `passwordHash`.
  2. Reject suspended users (`isBanned` or `deletedAt != null`).
  3. Revoke existing sessions for the user (session rotation).
  4. Create a new session token in `UserSession`.
  5. Return `{ token, user }` (sanitized).

## Session strategy
- Bearer token is the session id (`UserSession.id`).
- Middleware `requireAuth`:
  - Parses `Authorization: Bearer <token>`.
  - Validates session exists and is not expired.
  - Rejects suspended users (`isBanned` or `deletedAt`).
  - Updates `lastUsedAt` and extends expiry (sliding session expiry).
  - Attaches `req.user` for downstream handlers.
- Logout:
  - `/api/auth/logout` revokes current session token.
  - `/api/auth/logout-all` revokes all sessions for the user.

## User persistence model
- `User`:
  - Identity and account status (`email`, `username`, `displayName`, `role`, `isBanned`, `deletedAt`, `trustLevel`).
  - Wallet funds (`bankrollCents`).
- `UserSession`:
  - Session token and lifecycle (`createdAt`, `lastUsedAt`, `expiresAt`).
- `TournamentRegistration`:
  - Links users to tournament entries.
- `PokerPlayer`, `Hand`, `HandAction`, `HandPayout`:
  - Hand history and gameplay audit records.
- `PlayerBalance`, `BalanceTransaction`:
  - Authoritative in-table balances and transaction audit trail.

## API response safety
- User responses are sanitized through `toPublicUser(...)`.
- `passwordHash` is not returned by auth/profile/admin user endpoints.

## How this ties into poker gameplay
- Login gives client a bearer token.
- Client joins poker with this token; Colyseus calls `PokerRoom.onAuth`.
- `PokerRoom.onAuth` validates token via `AuthService.validateSession`.
- If valid, room binds that identity to `userId` and uses it for seat/action ownership.
- Seat identity is server-owned: authenticated users use `user.username` for in-game name.
- Reconnect is server-authoritative: if a seated user rejoins, server rebinds client session instead of creating a duplicate seat.
- On table join (`Dealer.addPlayer`):
  - Buy-in is processed by `CashierService`:
    - Debit `User.bankrollCents`
    - Credit `PlayerBalance`
    - Write `BalanceTransaction` (`BUYIN`)
  - In-memory player state mirrors persisted balance.
- During hand play:
  - `LedgerService` records blinds/bets/calls/payouts with deterministic `externalRef`.
  - `PlayerBalance` is the source of truth for in-hand chips.
- On table leave (`Dealer.removePlayer`):
  - Cash-out returns funds from `PlayerBalance` to `User.bankrollCents`.
  - Transaction is recorded (`CASHOUT`).

## Is Colyseus involved in user management?
Yes, directly for realtime session enforcement and ban propagation:
- Realtime auth gate: `PokerRoom.onAuth` enforces valid bearer tokens before room access.
- Session continuity: reconnect logic restores existing seat/session for transient disconnects.
- Ban enforcement:
  - Admin ban sets `isBanned=true` and revokes sessions.
  - Ban event emits via `sessionEvents`.
  - Users are kicked from active poker rooms via `matchMaker.remoteRoomCall(...)`.

Colyseus does not replace HTTP auth; it consumes the existing session model and enforces it at room boundaries.

## Client-side behavior (current)
- Client login/register obtains token and stores it in Zustand auth store.
- Token is persisted (`SecureStore` on native, `localStorage` on web).
- App bootstrap hydrates token, validates it via `/api/auth/me`, and clears invalid tokens.
- Hydrated token is synced into SDK context for API/realtime requests.

## Operational notes
- Auth routes have IP rate limiting.
- PersistenceFacade degrades to no-op when DB is unavailable/missing `DATABASE_URL`, allowing engine runtime but with reduced persistence guarantees.
- Ledger balance assertions are used to catch hand accounting mismatches.
