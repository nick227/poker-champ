# Bot Character System Proposal (Mental Model First)

## Purpose
Define the product mental model before implementation details.

We are not building "just bot logic."  
We are building a roster of poker characters that can sit at tables, accumulate history, and evolve with future features.

## Core Mental Model
One sentence rule:

`Bot = Character (data)`  
`Brain = Decision engine (code)`  
`Seat = Runtime binding (table state)`

If this stays true, architecture stays clean.

## Golden Rules
- Seats store `botId`, never `brainType`.
- Clients never send `brainType`.
- Bot catalog is the only place that maps `bot -> brainType`.
- Brain registry is the only place that maps `brainType -> code`.
- Dealer only consumes `pickAction()`.
- Bot identity concerns never enter Dealer logic.

## Product Framing
A bot is a first-class character in the poker universe.

It has:
- identity (name, future avatar/persona)
- persistent history (hands, winnings/losses)
- a referenced brain type
- ability to be seated like a human

A brain is a reusable decision module.

It has:
- a stable id (`random_v1`, `weighted_v1`, future `ai_v1`)
- code implementation only
- no character identity

Many bots can share one brain.

## What We Are Building
Three layers only:

1. Bot Catalog (characters)
- Persistent set of named bots.
- Each bot references a brain id.

2. Brain Registry (engines)
- In-code registry of brain implementations.
- Resolves `brainType -> implementation`.

3. Runtime Seats
- When seated, a seat stores `botId`.
- On turn, server resolves `bot -> brainType -> brain`.

No extra indirection needed right now.

## Ownership Boundary
Use a thin resolver boundary:

`Dealer -> BotResolver -> BrainRegistry`

Dealer does not resolve character metadata directly.  
Dealer asks `BotResolver` for a brain/action context using `seat.botId`.

## UX Flow: Add Bot Popup
Current state: users can add bots.

Proposed change:
1. User taps `+ Add Bot`.
2. Popup lists enabled bots from catalog.
3. User selects one bot.
4. Client sends:

```ts
ADD_BOT { botId: "nash_nate", buyInCents: 10000 }
```

Server decides brain from bot catalog.  
Client does not send `brainType`.

## Minimal Data Model

### Bot (persisted)
```ts
type Bot = {
  id: string;          // "nash_nate"
  name: string;        // "Nash Nate"
  avatarUrl?: string;  // future
  brainType: string;   // "random_v1", "weighted_v1", "ai_v1"
  isEnabled: boolean;
}
```

### BotStats (persisted, later)
```ts
type BotStats = {
  botId: string;
  handsPlayed: number;
  netCents: number;
  grossWonCents: number;
  grossLostCents: number;
}
```

Scope rule: `BotStats` are aggregated globally per `botId`.

### Seat state (runtime)
```ts
type SeatRuntime = {
  kind: "HUMAN" | "BOT";
  userId?: string;
  botId?: string;
}
```

No brain instance should be stored on the seat.

## Brain Registry (Code Only)
```ts
BrainRegistry = {
  random_v1: RandomBrain,
  weighted_v1: WeightedBrain,
  ai_v1: AiBrain, // future
}
```

Brains are code; bot rows reference them by id.

Brain instancing rule:
- Brains may be reused when stateless.
- Brains may be created per seat/turn when needed.
- System must not assume all brain implementations are singleton-safe.

## Runtime Turn Resolution
At bot turn:
1. get `toActSeat`
2. read `seat.botId`
3. ask `BotResolver` for bot + brain resolution
4. resolve `brain = BrainRegistry.create(bot.brainType)`
5. run `brain.pickAction(ctx)`
6. feed action into existing dealer action pipeline

Dealer should only know: "I need an action for this bot seat."  
Dealer should not care about bot avatar, cosmetics, rewards, or lore.

## Persistence Scope

### Now
- Persist bot catalog records.
- Bot catalog is authoritative and loaded at server boot (file seed or DB).
- Keep existing random bot behavior operational.

### Soon
- Persist bot study stats (`handsPlayed`, `netCents`, etc).

### Future
- Avatar assets
- bot prizes/items/cosmetics
- seasonal/event bots

All of that attaches to `Bot` identity, not to brain implementations.

## Why This Scales
- Add new bot: add one catalog row.
- Add new brain: register one implementation.
- Rebalance personality: change `bot.brainType`.
- Use same brain across many named bots.
- Future content features naturally fit character records.

## What We Are Intentionally Not Building Yet
- per-table bot profile systems
- per-seat persisted bot instance tables
- heavy factory layers beyond simple registry resolution
- complex bot DSL/config platform

Those can be added later only if proven necessary.

## System Contract Decisions
1. `ADD_BOT` uses `botId` (not `brainType`).
2. Bot catalog is source of truth for identity and brain mapping.
3. Brain registry is source of truth for executable logic.
4. Seat stores `botId` only.
5. Dealer consumes action output only.

## Implementation Plan (Reset)

### Phase A: Character-first foundation
- Add/seed `Bot` catalog source (file seed or DB-backed service).
- Load catalog at server boot as authoritative mapping.
- Keep `random_v1` as default registered brain.
- Update add-bot flow to select by `botId`.

### Phase B: Popup and selection
- Add client popup listing enabled bots.
- Send `ADD_BOT { botId, buyInCents }`.
- Keep existing add/remove lifecycle.

### Phase C: Stats for study cases
- Add `BotStats` persistence.
- Update stats after hand settlement per seated bot.

### Phase D: Future-ready hooks
- Add optional avatar URL usage in UI.
- Keep placeholders for prizes/items systems without coupling to Dealer.

## File-Level Starting Points
- `src/rooms/PokerRoom.ts`: validate `botId` on `ADD_BOT` and pass to server bot add flow.
- `packages/realtime-contract/src/table.ts`: update add-bot payload schema.
- `src/engine/dealer/services/PlayerLifecycleService.ts`: carry `botId` into seat/player state.
- `src/engine/bots/BotResolver.ts` (new): resolve `botId -> bot -> brainType -> brain`.
- `src/engine/dealer/services/TurnAutomationService.ts`: ask `BotResolver` for decision resolution.
- `apps/client/src/components/domain/table/hooks/useAddBot.ts`: launch popup and send selected `botId`.
- `apps/client/src/stores/multitable.store.ts`: pass `botId` through dispatch.

## Definition of Done (Mental Model Version)
- User can pick a named bot from popup and add it.
- Multiple different bots can share one brain.
- New bot onboarding is data-only (catalog entry).
- Dealer remains decoupled from bot identity/presentation concerns.
- Random bot remains available.
- Path is clear for future AI brain and future character features.
