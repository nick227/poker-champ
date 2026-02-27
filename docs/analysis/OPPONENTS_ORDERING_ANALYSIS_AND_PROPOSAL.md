# Opponents Ordering Analysis and Proposal

## Summary

The opponent list in `OpponentStrip` is currently in **table seat index order** (0, 1, 2, …), not in **seat order relative to the hero**. Seat numbers are tracked in the snapshot and used for dealer/toAct, but the `Opponent` type does not expose `seat`, and no ordering by “position relative to hero” is applied. This document analyses the current system and proposes a single, correct ordering at the adapter layer.

---

## 1. Current Behaviour

### 1.1 OpponentStrip.tsx

- **Props:** `opponents: Opponent[]`
- **Rendering:** `opponents.map((o) => …)` — no reordering; display order is exactly the array order passed in.
- **Seat usage:** None. The component does not receive or use seat numbers.

### 1.2 Opponent type (table.adapter.ts)

```ts
export type Opponent = {
  id: string;
  name: string;
  stackCents: number;
  isDealer?: boolean;
  isActive?: boolean;
  isBot?: boolean;
  status?: OpponentDisplayStatus;
  actionLabel?: string;
  cards?: { … };
};
```

- **No `seat` field.** Ordering by seat relative to hero is impossible at the UI layer without either adding `seat` or fixing order at the source.

### 1.3 Where opponents are produced

| Consumer | Source |
|----------|--------|
| Live table | `useTablePageController.tsx`: `mapSeatsToOpponents(snapshot)` |
| Replay (snapshots) | `ReplayFromSnapshots.tsx`: `mapSeatsToOpponents(provider.snapshot)` |
| Replay (remote) | `ReplayFromRemoteSource.tsx`: `mapSeatsToOpponents(provider.snapshot)` |
| Lesson | `app/lesson/[lessonId].tsx`: `mapSeatsToOpponents(snapshot)` |

All paths use **one function**: `mapSeatsToOpponents(snapshot)` in `apps/client/src/components/domain/table/table.adapter.ts`.

### 1.4 mapSeatsToOpponents (current)

- Iterates `for (const seat of snapshot.seats)`.
- Skips unoccupied, no `userId`, or `userId === heroId`.
- Pushes each remaining seat’s data as an `Opponent` (without `seat`).
- **Order:** Same as `snapshot.seats` — i.e. **ascending seat index** (0, 1, 2, …). So opponents appear in table seat number order, not “left-to-right relative to hero”.

### 1.5 Are we tracking seat numbers?

**Yes.**

- **Contract:** `TableSeatSnapshotSchema` (realtime-contract) has `seat: z.number().int().min(0)`.
- **Server:** `SnapshotService.buildBaseSnapshot()` builds seats with `state.seats.map((occupantUserId, seat) => ({ seat, ... }))`, so `seats[i].seat === i` and the array is in seat index order.
- **Adapter:** Uses `seat.seat` for `isDealer` and for hero resolution; it does not pass `seat` through to `Opponent` or use it for ordering.

So: seat numbers exist and are used for dealer/toAct/hero; they are **not** used to order the opponents list.

---

## 2. Desired Order (relative to hero)

Convention for the strip:

- **First opponent in list** = seat **after** hero (next to act after hero; “left of hero” in physical table terms).
- **Last opponent in list** = seat **before** hero (acted before hero; “right of hero”).

So the list should follow **acting order starting from the player to hero’s left**:

- Position 0: seat `(heroSeat + 1) % maxSeats`
- Position 1: seat `(heroSeat + 2) % maxSeats`
- …
- Last: seat `(heroSeat - 1 + maxSeats) % maxSeats`

Sort key for an opponent at seat `s` (with hero at `H`, `N = maxSeats`):

- `(s - H + N) % N`  
  This gives values in `[1, N-1]` for opponents (0 is hero and is excluded). Sorting by this key yields the desired order.

---

## 3. Optimal layer to enforce order

**Single place:** `mapSeatsToOpponents` in `table.adapter.ts`.

Reasons:

1. It is the **only** producer of the opponents array for table, replay, and lesson.
2. It already has `snapshot.hero.seat`, `snapshot.seats` (each with `.seat`), and `snapshot.table?.maxSeats ?? snapshot.seats.length`.
3. Fixing order here guarantees correct order for `OpponentStrip` and any future consumer without duplicating logic.
4. Keeps `OpponentStrip` presentational: it continues to receive an already-ordered list.

---

## 4. Proposal

### 4.1 Add `seat` to Opponent (optional but recommended)

- Add `seat: number` (or `seat?: number` if we want to avoid breaking existing typings) to the `Opponent` type.
- Populate it in `mapSeatsToOpponents` from `seat.seat`.
- **Benefits:** Stable ordering by seat; future UI (e.g. “seat 3”) or analytics can use it without touching the snapshot.

### 4.2 Order opponents in mapSeatsToOpponents

- After building the `opponents` array (or an intermediate list that includes seat numbers), sort by **position relative to hero**.
- Use:
  - `heroSeat = snapshot.hero.seat`
  - `maxSeats = snapshot.table?.maxSeats ?? snapshot.seats.length`
  - For each opponent with `seat s`, sort key: `(s - heroSeat + maxSeats) % maxSeats`
- Edge: if `heroSeat == null` or hero not seated, keep current order (e.g. by seat index) so behaviour is unchanged when hero is not in a seat.

### 4.3 Implementation sketch

```ts
// In mapSeatsToOpponents, after the loop that pushes to opponents:
const heroSeat = snapshot.hero.seat;
const maxSeats = snapshot.table?.maxSeats ?? snapshot.seats.length;

if (heroSeat != null && maxSeats > 0) {
  opponents.sort((a, b) => {
    const keyA = (a.seat - heroSeat + maxSeats) % maxSeats;
    const keyB = (b.seat - heroSeat + maxSeats) % maxSeats;
    return keyA - keyB;
  });
}
```

This requires `Opponent` to include `seat` (or a temporary type that has `seat` until we sort, then we drop it — but then we don’t expose seat to the UI). Recommended: add `seat` to `Opponent` and use it for the sort and for future use.

### 4.4 Tests

- **table.adapter.money.test.ts:** Current snapshot has hero at seat 0, one opponent at seat 1. After change: single opponent remains first; add a test that with hero at 1 and opponents at 0 and 2, order is [2, 0] (seat 2 first = after hero, seat 0 last = before hero).
- Optionally add a small unit test in table.adapter that asserts order for a 4-max table with hero at 2 and opponents at 0, 1, 3 → expected order [3, 0, 1].

### 4.5 No changes required in

- **OpponentStrip.tsx** — still receives `opponents: Opponent[]` and renders in array order.
- **TableSceneShell** — only passes `opponents` through.
- **useTablePageController / Replay / Lesson** — still call `mapSeatsToOpponents(snapshot)`; order is fixed inside the adapter.

---

## 5. Summary Table

| Aspect | Current | Proposed |
|--------|---------|----------|
| Order of `opponents` | Table seat index (0,1,2,…) | Seat relative to hero: first = after hero, last = before hero |
| `Opponent.seat` | Not present | Present (recommended) |
| Where order is applied | N/A | `mapSeatsToOpponents` (table.adapter.ts) |
| Seat numbers in system | Yes (snapshot + server) | Unchanged; used for ordering and optional Opponent.seat |

---

## 6. References

- `apps/client/src/components/domain/table/OpponentStrip.tsx` — consumer of `opponents`
- `apps/client/src/components/domain/table/table.adapter.ts` — `mapSeatsToOpponents`, `Opponent` type
- `apps/client/app/table/useTablePageController.tsx` — live table opponents source
- `packages/realtime-contract/src/table.ts` — `TableSeatSnapshotSchema`, `TableSnapshotPayloadSchema`
- `src/engine/dealer/services/SnapshotService.ts` — `buildBaseSnapshot()` seats array (index = seat)
