# First Admin Setup

## Goal
Create the first `ADMIN` user so admin-protected routes and `/admin` are accessible.

## Prerequisites
- App database is running and reachable from this repo.
- Target user already exists in `User` table (created via normal register flow).

## Step 1: Promote Existing User to ADMIN
Run:

```bash
pnpm admin:make -- user@email.com
```

Equivalent command:

```bash
node scripts/make-admin.js user@email.com
```

Expected output:
- `Promoted user@email.com (<user-id>) to ADMIN`

## Step 2: Verify API Access
1. Login as that user.
2. Call `GET /api/auth/me` and confirm `user.role === "ADMIN"`.
3. Call `GET /api/admin/users?page=1&limit=10` with bearer token.

Expected:
- HTTP `200`
- Response contains `users` and `total`.

## Step 3: Verify Admin Page Guard
1. Open `/admin` while logged out:
- Expected redirect to `/login`.
2. Open `/admin` as non-admin:
- Expected redirect to `/`.
3. Open `/admin` as admin:
- Expected access granted and user list visible.

## Notes
- Admin endpoints must always use `requireAuth -> requireAdmin`.
- This script is intended for initial bootstrap and operational fallback.
