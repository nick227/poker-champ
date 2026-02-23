# Admin Tools & Routes Proposal

## 1. Overview
The system currently includes a `UserRole` enum (`USER`, `MODERATOR`, `ADMIN`) in the `User` model, but no logic or routes utilize it. This proposal outlines the necessary routes and tools to enable `ADMIN` users to manage the platform effectively.

## 2. Authentication Middleware
We need a middleware to protect admin routes.

- **`requireAdmin` Middleware**:
    1.  Extracts `authToken` from `Authorization` header.
    2.  Calls `AuthService.validateSession(token)`.
    3.  Checks if `user.role === 'ADMIN'`.
    4.  If valid, attaches `user` to `req` and calls `next()`.
    5.  Else, returns `401 Unauthorized` or `403 Forbidden`.

## 3. Proposed Admin Routes API (`/api/admin`)

### A. User Management
*   `GET /api/admin/users`: List all users (paginated, search by email/name).
*   `GET /api/admin/users/:id`: Get detailed profile (sessions, hand history summary, balance).
*   `POST /api/admin/users/:id/ban`: Ban a user (`isBanned = true`).
*   `POST /api/admin/users/:id/unban`: Unban a user.
*   `PATCH /api/admin/users/:id/role`: specific role (e.g., promote to MODERATOR).

### B. Table Control (Live State)
*   `GET /api/admin/tables`: List active Colyseus rooms/tables with metadata (player count, pot size).
*   `POST /api/admin/tables/:roomId/close`: Force close a table (refund players, disconnect).
*   `POST /api/admin/tables/:roomId/kick`: Kick a specific `sessionId` from a table.

### C. System Inspection
*   `GET /api/admin/stats`: Server health (memory usage, total connections, uptime).

## 4. Implementation Plan

### Step 1: Create Admin Middleware
Create `src/engine/auth/AdminMiddleware.ts` to secure the new routes.

### Step 2: Create Admin Router
Create `src/engine/auth/AdminRouter.ts` and mount it at `/api/admin` in `index.ts`.

### Step 3: Implement Service Logic
Add necessary methods to `AuthService` or a new `AdminService` class:
*   `getAllUsers(page, limit)`
*   `banUser(userId)`
*   `getLiveTables()` (Interfacing with Colyseus `matchMaker`)

### Step 4: Frontend "Admin Console" (Future)
Eventually, the frontend will need a protected `/admin` route that consumes these APIs to provide a dashboard UI.

## 5. Security Considerations
*   **Audit Logging**: Every admin action (ban, close table) should be logged to a new `AdminLog` table or structured logs for accountability.
*   **Role Hierarchy**: Ensure MODERATORs have a subset of permissions (e.g., Ban/Kick but not Delete DB or promote other Admins).
