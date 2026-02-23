# Admin MVP Proposal (Absolute Minimum)

## 1. Goal
Unblock internal admin workflows with the smallest safe implementation.

## 2. MVP Scope
Implement only:
- `User.role` with `USER | ADMIN` (already present).
- `requireAdmin` middleware.
- Two admin endpoints:
  - `PATCH /api/admin/users/:id/promote`
  - `POST /api/admin/users`
- One-time bootstrap script:
  - `node scripts/make-admin.js user@email.com`
- Simple frontend `/admin` guard.

## 3. Non-Goals (Skipped for MVP)
- No audit logs.
- No rate limits.
- No role change history.
- No RBAC matrix/scopes/policies.
- No admin UI tables/dashboard.
- No last-admin protection logic.

## 4. Backend Requirements

### 4.1 Middleware Chain (Required Rule)
Never expose admin endpoints without:
- `requireAuth -> requireAdmin`

### 4.2 `requireAdmin` Middleware
```ts
export function requireAdmin(req, res, next) {
  if (!req.user) return res.sendStatus(401);
  if (req.user.role !== "ADMIN") return res.sendStatus(403);
  next();
}
```

### 4.3 Endpoints

1. `PATCH /api/admin/users/:id/promote`
- Purpose: Promote existing user to `ADMIN`.
- Server logic:
```ts
await prisma.user.update({
  where: { id },
  data: { role: "ADMIN" }
});
```

2. `POST /api/admin/users`
- Purpose: Create a new admin user.
- Behavior: Create user with `role: "ADMIN"`.

## 5. Bootstrap Script (One-Time)
Command:
```bash
node scripts/make-admin.js user@email.com
```

Implementation:
```ts
await prisma.user.update({
  where: { email },
  data: { role: "ADMIN" }
});
```

Use once to seed initial admin, then keep as operational fallback.

## 6. Frontend Guard (Simple)
When loading `/admin`:
```ts
if (!me) redirect("/login");
if (me.role !== "ADMIN") redirect("/");
```

No admin UI required for MVP.

## 7. Acceptance Criteria
- Non-authenticated user cannot access admin routes (`401`).
- Authenticated non-admin cannot access admin routes (`403`).
- Admin can promote a user via `PATCH /api/admin/users/:id/promote`.
- Admin can create admin user via `POST /api/admin/users`.
- Initial admin can be seeded via `scripts/make-admin.js`.
- Frontend blocks non-admins from `/admin`.
