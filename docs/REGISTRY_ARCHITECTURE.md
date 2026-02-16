# Registry Architecture (Declarative Extension Model)

## Goal
Replace scattered branching logic and per-feature wiring with central, declarative registries:

`key -> definition object -> generic executor`

This keeps growth append-only and reduces coupling.

## Implemented Registries

### Service Registry
File: `apps/client/src/registry/service.registry.ts`

- `serviceRegistry.get.lobbyTables()`
- `serviceRegistry.get.economyWallet()`
- `serviceRegistry.post.authLogin(input)`
- `serviceRegistry.post.joinTable(input)`
- normalized shape:
  - `serviceRegistry.byKey`
  - `serviceRegistry.ordered`
  - compatibility aliases preserved: `serviceRegistry.get`, `serviceRegistry.post`

All calls run through shared error normalization (`withApiError`).

### Store Registry
File: `apps/client/src/registry/store.registry.ts`

- `storeRegistry.auth()`
- `storeRegistry.lobby()`
- `storeRegistry.tables()`
- plus hook access under `storeRegistry.use.*`
- normalized shape:
  - `storeRegistry.byKey`
  - `storeRegistry.ordered`
  - compatibility aliases preserved: `storeRegistry.auth/lobby/tables`
- table action dispatch via store:
  - `storeRegistry.tables().dispatchTableAction(...)`

### Screen / Route Registry
File: `apps/client/src/registry/screen.registry.ts`

Central route metadata:
- path
- authRequired
- title
- bottom bar settings
- component path
- normalized shape:
  - `screenRegistry.byKey`
  - `screenRegistry.ordered`
  - `screenRegistry.bottomBar`

Used by:
- `apps/client/app/index.tsx` via `getDefaultRoute`
- `apps/client/src/components/containers/BottomBar.tsx` via `bottomBarScreens`

### Realtime Message Registry
File: `apps/client/src/registry/realtime-message.registry.ts`

Maps message type -> handler + dispatcher:
- `ERROR`
- `SESSION_RESTORED`
- `TABLE_LIST`
- normalized shape:
  - `realtimeMessageRegistry.byKey`
  - `realtimeMessageRegistry.ordered`

Runtime wiring:
- `apps/client/src/realtime/useLobbyRealtime.ts`
- `apps/client/src/realtime/transport.ts`
- note:
  - compatibility wrapper over unified `realtime-channel.registry.ts`

### Realtime Channel Hook
File: `apps/client/src/realtime/useRealtimeChannel.ts`

Single channel hook used by wrappers:
- `useLobbyRealtime()`
- `useTableRealtime(tableId, onError?)`

This centralizes:
- transport selection (`ws`/`colyseus`)
- reconnect/session lifecycle
- sender surface (`send(type, payload?)`)
- transport mode supports both:
  - raw websocket (`EXPO_PUBLIC_REALTIME_TRANSPORT=ws`)
  - Colyseus room transport (`EXPO_PUBLIC_REALTIME_TRANSPORT=colyseus`)
- normalized lifecycle events are emitted by transport:
  - `CONNECTED`
  - `DISCONNECTED`
  - `RECONNECTING`

### Table Message Registry
File: `apps/client/src/registry/table-message.registry.ts`

Table-focused message mapping:
- `WELCOME`
- `SESSION_RESTORED`
- `ERROR`
- normalized shape:
  - `tableMessageRegistry.byKey`
  - `tableMessageRegistry.ordered`

Runtime wiring:
- `apps/client/src/realtime/useTableRealtime.ts`
- `apps/client/src/realtime/transport.ts`
- note:
  - compatibility wrapper over unified `realtime-channel.registry.ts`

### Realtime Channel Registry
File: `apps/client/src/registry/realtime-channel.registry.ts`

Single scope-aware realtime definition:
- `realtimeChannelRegistry.byScope.lobby`
- `realtimeChannelRegistry.byScope.table`
- `dispatchRealtimeChannelMessage(scope, type, payload, context)`

Used by:
- `apps/client/src/realtime/useLobbyRealtime.ts`
- `apps/client/src/realtime/useTableRealtime.ts`

### Transport Registry
File: `apps/client/src/registry/transport.registry.ts`

Central transport mode/config resolver:
- `transportRegistry.byKey` / `transportRegistry.ordered`
- `getRealtimeTransportMode()`
- `resolveRealtimeTransportConfig({ scope, id, token })`

Used by:
- `apps/client/src/realtime/useRealtimeChannel.ts`
- `apps/client/src/components/containers/AppShell.tsx`
- table realtime can join Colyseus poker rooms by roomId when transport mode is `colyseus`

### Table Action Registry
File: `apps/client/src/registry/table-action.registry.ts`

Poker action definitions:
- key
- label
- hotkey
- amount requirement
- normalized shape:
  - `tableActionRegistry.byKey`
  - `tableActionRegistry.ordered`

Includes generic executor:
- `executeTableAction(action, context, send)`

Used by:
- `apps/client/app/table/[id].tsx`

### Panel Registry
File: `apps/client/src/registry/panel.registry.tsx`

Maps panel key -> component + label.
- normalized shape:
  - `panelRegistry.byKey`
  - `panelRegistry.ordered`

Used by:
- `apps/client/app/table/[id].tsx`

### Error Registry
File: `apps/client/src/registry/error.registry.ts`

Maps API error code/status -> UX behavior:
- toast
- redirect
- focus
- silent

Integrated in:
- `apps/client/src/services/_helpers/withApiError.ts`
- normalized shape:
  - `errorRegistry.byKey`
  - `errorRegistry.ordered`

## Transport Capabilities Descriptor

File: `apps/client/src/realtime/transport.ts`

```ts
export const transportCapabilities = {
  supportsRooms: true,
  supportsPresence: true,
  supportsBinary: false,
};
```

## Refactors Applied

- Service wrappers now call service registry:
  - `apps/client/src/services/get/lobby.get.ts`
  - `apps/client/src/services/get/economy.get.ts`
  - `apps/client/src/services/post/auth.post.ts`
- Bottom bar now renders from screen registry, not hardcoded routes.
- Table screen uses:
  - panel registry
  - action registry
  - store dispatch for realtime actions (`dispatchTableAction`)
- SDK bootstrap now reads auth via store registry.
- Lobby/Table/MultiTable UI use `storeRegistry.use.*` instead of direct store imports.

## Rule of Thumb

If adding a new variant requires touching more than one file, add/extend a registry entry instead of adding branching logic.
