# Auth & Identity Improvement Proposal

## 1. Current State & problem

Currently, the Poker Engine operates on an **ephemeral, session-based identity model**:
*   **Identity**: Players are identified solely by their WebSocket `sessionId`.
*   **Persistence**: A `PokerPlayer` record is created in the DB for each hand/session, but it is not linked to a long-term user account.
*   **Security**: Minimal. Anyone can join any public table. Private tables use a shared password.
*   **Consequences**:
    *   No player history or stats tracking (ROI, hands played).
    *   No way to ban problem users effectively.
    *   No persistent bankroll (players "buy in" with imaginary money each time).

## 2. Proposed Architecture

We will move to a **Hybrid Identity Model** allowing both Guests (low friction) and Registered Users (persistent stats/bankroll).

### A. Database Schema Updates (`schema.prisma`)

We need a central `User` entity to own the `PokerPlayer` sessions.

```prisma
enum UserRole {
  USER
  MODERATOR
  ADMIN
}

model User {
  id            String    @id @default(uuid())
  email         String    @unique
  passwordHash  String
  displayName   String
  role          UserRole  @default(USER)
  
  // Trust & Safety
  isBanned      Boolean   @default(false)
  trustLevel    Int       @default(1) // 1=New, 2=Verified, 3=Trusted
  
  // Economy
  bankrollCents Int       @default(0) // Central wallet
  
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  // Relations
  sessions      UserSession[]
  playerHistory PokerPlayer[] // Link effectively ephemeral table-seats to a real user
}

model UserSession {
  id        String   @id // Token
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  expiresAt DateTime
}

// Update existing model
model PokerPlayer {
  // ... existing fields ...
  userId    String?  // Nullable for Guests
  user      User?    @relation(fields: [userId], references: [id])
}
```

### B. Authentication Flow

We will implement a **Token-Based Authentication** system alongside the WebSocket connection.

1.  **Registration/Login (HTTP)**:
    *   `POST /api/auth/register` -> Returns `authToken`.
    *   `POST /api/auth/login` -> Returns `authToken`.
2.  **Room Connection (WebSocket)**:
    *   Client sends `authToken` in the connection options (Colyseus `onAuth`).
3.  **Validation**:
    *   **Registered**: Server verifies token -> loads `User` -> sets `client.auth` context.
    *   **Guest**: No token -> Assigns temporary Guest ID -> `client.auth = { isGuest: true }`.

### C. Permissions & Governance

#### Roles
*   **Guest**: Can join Public tables. Max buy-in limited. specific "Guest" prefix in display name.
*   **User**: Can create tables actions tracked in history. Full stats.
*   **Admin**: Can spectate any table (including private). Can ban users. Can close tables.

#### Ban System
*   **Account Ban**: Flag `User.isBanned = true`. Prevent login.
*   **IP Ban** (Optional/Advanced): Redis/DB list of banned IPs for repeated offenders.
*   **Shadow Ban** (Optional): Let them play but only with bots or other shadow-banned users (low priority, but good for anti-toxicity).

## 3. Implementation Roadmap

### Phase 1: Core User Management
*   [ ] Update `prisma.schema` with `User` and `UserSession`.
*   [ ] Create `AuthService` (hashing, token generation).
*   [ ] Implement HTTP endpoints (Express/Colyseus `app.post`) for Login/Register.

### Phase 2: Room Integration
*   [ ] Implement `onAuth()` in `PokerRoom` and `LobbyRoom`.
*   [ ] Update `Dealer.addPlayer` to accept `userId` (if authenticated).
*   [ ] Update `PersistenceFacade` to link hand history to real `User` IDs.

### Phase 3: Trust & Safety
*   [ ] Add `isBanned` check in `onAuth`.
*   [ ] Add "Kick" and "Ban" commands for Admin users in chat/console.
*   [ ] Implement "Trust Level" restrictions (e.g., must be Trust Level 2 to create a Private Table).

### Phase 4: Persistent Economy (Future)
*   [ ] "Deposit" and "Withdraw" chips from `User.bankrollCents` when joining/leaving a table.
*   [ ] Atomic transactions to ensure chips are never lost during server crashes.

## 4. Security Considerations
*   **Passwords**: Use `bcrypt` (already present) with proper salt rounds.
*   **Tokens**: Use secure, random tokens (e.g., `nanoid` or unsigned JWTs if stateless preferred).
*   **Socket Context**: Store minimal user data in `client.userData` to avoid stale state. Fetch critical auth checks (bans) from DB/Cache on sensitive actions if needed.
