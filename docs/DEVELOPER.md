# Poker Champ Client — Developer Introduction

A multi-platform poker champ app built with **Expo (React Native)** targeting web, iOS, Android, and desktop (Tauri). This guide helps developers onboard and maintain the client.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Expo ~52, React 18 |
| Routing | expo-router (file-based) |
| State | Zustand |
| Styling | NativeWind 4 (Tailwind CSS) |
| API | `@poker-champ/sdk` (OpenAPI-generated) |
| Realtime | Colyseus.js (WebSocket mode experimental) |

---

## Monorepo Structure

```
poker-champ/
├── apps/client/          # This app
├── packages/sdk/         # @poker-champ/sdk — API client (OpenAPI-generated)
├── scripts/              # openapi export, sdk sync
└── package.json          # Root scripts (dev, build, sdk:gen, verify)
```

SDK is regenerated via `pnpm sdk:gen` from the backend OpenAPI spec. The client depends on it as `workspace:*`.

---

## Project Layout

```
apps/client/
├── app/                  # Screens (expo-router file-based)
│   ├── _layout.tsx       # Root layout, bootstrap, AppShell
│   ├── index.tsx         # Redirects by auth
│   ├── login.tsx
│   ├── lobby.tsx
│   ├── table/[id].tsx
│   └── settings.tsx
├── src/
│   ├── bootstrap/        # SDK init, auth sync
│   ├── components/
│   │   ├── base/         # Button, Text, Input
│   │   ├── containers/   # Screen, TopBar, BottomBar, AppShell
│   │   └── domain/       # GameTableRow, MultiTableTabs, StatChip
│   ├── registry/         # Registries (see below)
│   ├── realtime/         # WebSocket/Colyseus transport, hooks
│   ├── services/         # API wrappers (get/*, post/*, _helpers)
│   ├── stores/           # Zustand: auth, lobby, multitable
│   ├── theme/            # Design tokens (tokens.ts, tokens.css)
│   └── tests/
├── app.config.ts         # Expo config, env exposure
└── .env                  # EXPO_PUBLIC_* (see .env.example)
```

---

## Registry Pattern

The app uses **registries** to centralize configuration and handlers. Registries live in `src/registry/` and are exported from `src/registry/index.ts`.

| Registry | Purpose |
|----------|---------|
| `screenRegistry` | Routes, auth, bottom bar config |
| `storeRegistry` | Zustand stores + React hooks |
| `serviceRegistry` | API service wrappers |
| `panelRegistry` | Table panels (Realtime, Stats) |
| `tableActionRegistry` | Poker actions (fold, check, call, bet, raise, allIn) |
| `realtimeMessageRegistry` | Lobby realtime message handlers |
| `tableMessageRegistry` | Table realtime message handlers |
| `errorRegistry` | Error codes → UX behavior (toast, redirect, focus) |

To add a new screen: update `screen.registry.ts` (path, auth, bottom bar) and add `app/<name>.tsx`. To add a table action: add to `table-action.registry.ts`. To add realtime handlers: extend the appropriate message registry.

---

## State Management

Three Zustand stores:

| Store | File | Role |
|-------|------|------|
| `auth` | `stores/auth.store.ts` | Token, setToken, logout. Syncs to SDK via bootstrap. |
| `lobby` | `stores/lobby.store.ts` | Tables list, busy, error, transportState. Fetches via `getLobbyTables` and realtime. |
| `multitable` | `stores/multitable.store.ts` | openTableIds, activeTableId, tableSenders. Registers realtime senders per table for actions. |

Access via `storeRegistry.use.auth`, etc. Do not import stores directly when using the registry pattern.

---

## Services & SDK

- **API**: `@poker-champ/sdk` (auth, lobby, economy, tournaments, etc.).
- **Client wrappers**: `src/services/get/*`, `src/services/post/*` use `serviceRegistry` and `withApiError`.
- `withApiError` normalizes errors and maps them to `errorRegistry` UX behavior.

Do not add direct `fetch` in UI; route all API calls through the SDK and service helpers.

**SDK consumption (E2E check):**

| Concern | Where | Notes |
|--------|--------|--------|
| Bootstrap | `app/_layout.tsx` → `bootstrapSdk()` | Runs once; sets `EXPO_PUBLIC_API_URL`, syncs auth token from store to SDK. |
| Token sync | `bootstrap/sdk.ts` | `setAuthToken(storeRegistry.auth().token)` at boot; `storeRegistry.use.auth.subscribe` keeps SDK token in sync with store. |
| Login | `app/login.tsx` → `postAuthLogin` → `auth.login` | Uses `ApiError` for message; stores token via `setToken(res.data.token)`. |
| Logout | `app/settings.tsx` → `postAuthLogout` → `auth.logout` | Calls API then clears store/SDK token. |
| Profile | `useProfile` → `auth.me()` | Reads `res.data.user` (displayName, email). |
| Lobby / Economy | `getLobbyTables`, `getEconomyBalance` | Via `serviceRegistry.get.lobbyTables`, `economyWallet`; unwrap `res.data`. |
| Create table / Buy-in | `postCreateTable`, `serviceRegistry.post.buyIn` | Same pattern; errors via `withApiError` → `errorRegistry`. |
| Realtime auth | `useRealtimeChannel` | Table scope uses `getAuthToken()` from SDK for join. |
| Errors | `withApiError`, `ApiError` | All service calls go through `withApiError`; UI uses `ApiError` where needed (e.g. login). |

---

## Realtime

- **Transport**: Colyseus by default via `EXPO_PUBLIC_REALTIME_TRANSPORT=colyseus`. Raw `ws` is experimental.
- **URLs**: `EXPO_PUBLIC_WS_URL`, `EXPO_PUBLIC_COLYSEUS_URL`.
- **Hooks**:
  - `useLobbyRealtime()` — connects on lobby scope, receives TABLE_LIST, ERROR, transport state.
  - `useTableRealtime({ tableId, buyInCents, password?, onError? })` — joins table via room join options (buy-in required), registers sender for table actions.
- **Message flow**: `transport.ts` → `useRealtimeChannel` → registry dispatchers (`dispatchRealtimeMessage`, `dispatchTableMessage`).

---

## Styling

- **Design tokens**: `src/theme/tokens.ts` + `tokens.css` (colors, radius, spacing).
- **Tailwind**: `tailwind.config.js`, `postcss.config.js`, `global.css` import.
- **NativeWind**: Use `className` on RN components.
- **Text variants**: `Text` component supports `variant` (h1, body, muted, danger, etc.).

---

## Configuration

| Env var | Purpose |
|---------|---------|
| `EXPO_PUBLIC_API_URL` | REST API base |
| `EXPO_PUBLIC_WS_URL` | Experimental raw WebSocket URL (optional) |
| `EXPO_PUBLIC_COLYSEUS_URL` | Colyseus URL |
| `EXPO_PUBLIC_REALTIME_TRANSPORT` | `colyseus` (default) or `ws` |
| `EXPO_PUBLIC_ENABLE_EXPERIMENTAL_WS` | `true` to allow `ws` mode |

Copy `.env.example` to `.env` and adjust for your environment.

---

## Scripts

| Script | Location | Purpose |
|--------|----------|---------|
| `pnpm dev` | root / client | Start Expo (Metro) |
| `pnpm dev:web` | root / client | Expo web |
| `pnpm build:web` | client | Export static web |
| `pnpm build:android` | client | EAS build |
| `pnpm build:ios` | client | EAS build |
| `pnpm build:desktop` | root | Web + Tauri |
| `pnpm sdk:gen` | root | Regenerate SDK from OpenAPI |
| `pnpm test:client` | root | Run Vitest |
| `pnpm typecheck` | root | TS check |
| `pnpm verify` | root | sdk:check + test + typecheck + ui:no-fetch |

---

## Testing

- **Vitest** in `src/tests/` (e.g. `screen.registry.test.ts`, `table-action.registry.test.ts`, `withApiError.test.ts`).
- Run: `pnpm -C apps/client test` or `pnpm test:client` from root.

---

## Initial Testing

1. **Setup**: Copy `.env.example` → `.env`. Set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_COLYSEUS_URL` for your backend.
2. **Backend**: API (REST) and Colyseus (or ws) must be running.
3. **Run**: From monorepo root `pnpm dev` or from `apps/client` run `pnpm dev`; choose `w` for web.
4. **Smoke test**: Login → Lobby (game list, sort, Create Game) → Join table → Table view (cards, actions, chat) → Settings → Logout.
5. **Verify**: `pnpm typecheck` and `pnpm test:run` pass.

---

## Path Aliases

Configured in `tsconfig.json`:

- `@/*` → `src/*`
- `@ui/*` → `src/components/*`
- `@services/*` → `src/services/*`
- `@stores/*` → `src/stores/*`

---

## Conventions

- **No `:any`** — use proper types.
- **Short files** — prefer &lt;200 lines; split logic into dedicated modules.
- **Registries** — extend registries rather than hardcoding maps.
- **Services** — use SDK + `withApiError`; no direct fetch in UI.
- **Reuse** — prefer existing components and patterns; avoid redundant code.

---

## Extension Checklist

- **New screen**: Add route in `screen.registry.ts`, create `app/<name>.tsx`.
- **New table panel**: Add entry in `panel.registry.tsx`.
- **New table action**: Add to `table-action.registry.ts`.
- **New API endpoint**: Run `pnpm sdk:gen` if backend OpenAPI changed; add service wrapper in `service.registry.ts` if needed.
- **New realtime message**: Add handler in `realtime-message.registry.ts` or `table-message.registry.ts`.
- **New store**: Create Zustand store, add to `store.registry.ts`.
