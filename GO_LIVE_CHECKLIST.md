# Final Go-Live Checklist

Use this checklist to validate the stack, run backend + frontend locally, and verify the app in browser.

## 1) Install dependencies

```bash
pnpm install
```

## 2) Configure environment

### Backend (`.env` at repo root)

Minimum local dev:

```env
NODE_ENV=development
PORT=2567
LOG_LEVEL=info
```

Production-required (server now enforces these when `NODE_ENV=production`):

```env
NODE_ENV=production
PORT=2567
LOG_LEVEL=info
DATABASE_URL=mysql://user:pass@host:3306/poker
CORS_ORIGINS=https://your-frontend-domain.com,https://admin.your-domain.com
```

### Frontend (`apps/client/.env`)

Create from `apps/client/.env.example` and ensure API points to backend port:

```env
EXPO_PUBLIC_API_URL=http://localhost:2567
EXPO_PUBLIC_API_VERSION=0.1.0
EXPO_PUBLIC_COLYSEUS_URL=ws://localhost:2567
EXPO_PUBLIC_REALTIME_TRANSPORT=colyseus
EXPO_PUBLIC_ENABLE_EXPERIMENTAL_WS=false
```

## 3) Run full pre-launch checks

```bash
pnpm verify
```

This runs:
- SDK generation + SDK typecheck
- client tests
- realtime contract + server/client typechecks
- no-direct-fetch UI guard

## 4) Start backend server

From repo root:

```bash
pnpm tsx src/index.ts
```

Expected:
- server log includes `Server listening (Express + Colyseus)`
- health endpoint returns OK at `http://localhost:2567/health`

Quick health check:

```bash
curl http://localhost:2567/health
```

## 5) Start frontend (web)

In a second terminal:

```bash
pnpm dev:web
```

Expo will print a local web URL (typically `http://localhost:8081` or `http://localhost:19006`).

## 6) Browser smoke flow

1. Open the Expo web URL.
2. Confirm login screen loads.
3. Sign in with a valid account.
4. Confirm lobby loads and table list appears.
5. Open a table and verify:
- realtime connects (no repeated reconnect loop)
- table actions send without schema errors

## 7) Release gate (recommended)

Before release/tag:

```bash
pnpm verify
pnpm build:web
```

Optional scheduled smoke lane already exists for:
- `pnpm build:web`
- `pnpm build:desktop`

## 8) Troubleshooting quick checks

- If login fails with 503: verify `DATABASE_URL` and DB connectivity.
- If browser API calls fail: confirm `EXPO_PUBLIC_API_URL` matches backend port (`2567` by default).
- If CORS errors in production: ensure request origin is included in `CORS_ORIGINS`.
- If realtime fails: confirm `EXPO_PUBLIC_COLYSEUS_URL=ws://<backend-host>:<port>` and transport is `colyseus`.
