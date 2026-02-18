# Avatar Picker Design Proposal

## Goal

Introduce pre-defined site avatars: a JSON-backed config, an avatar picker sheet on the front end, and schema/backend support so the chosen avatar can be shown for the user (and eventually for opponents).

## Current State

### Schema (no avatar support today)

- **Realtime contract** (`packages/realtime-contract/src/table.ts`):
  - `TableSeatSnapshotSchema`: `seat`, `occupied`, `userId`, `isBot`, `name`, `status`, `stackCents`, etc. — **no avatar field**.
  - Hero: `userId`, `youAreSeated`, `seat`, `holeCards`, `actionOptions`, `calculations` — **no avatar field**.
- **Engine / room**: Player has `name` (from join username). No avatar stored or broadcast.
- **Profile** (`apps/client/src/hooks/useProfile.ts`): `username`, `location`, `userId` — no avatar.

### UI (initial-only avatars)

- **ProfileStrip**: circle with `username.slice(0, 1).toUpperCase()`.
- **OpponentStrip**: circle with `o.name.slice(0, 1).toUpperCase()` per opponent.
- **PlayerHistoryPopup**: large circle with `name.slice(0, 1).toUpperCase()`.

So we currently have **no schema or profile support for avatars**; all avatars are initial-based.

### Existing patterns to reuse

- **ModalSheet** + **ThemePickerSheet**: bottom sheet, title, scroll, grid of selectable options, selection persisted in `usePreferencesStore`. Same pattern fits an avatar picker.
- **Preferences store**: persisted (e.g. localStorage); good for client-only avatar choice.

---

## 1. Site avatars: JSON config

- **Location**: e.g. `apps/client/src/config/avatars.json` (or `public/avatars.json` if we want a single source loadable by URL).
- **Shape (minimal)**:

```json
[
  { "id": "default", "url": "/avatars/default.svg", "label": "Default" },
  { "id": "ace", "url": "/avatars/ace.svg", "label": "Ace" }
]
```

- **Type**: `Array<{ id: string; url: string; label?: string }>`.
- **Validation**: At build or load time, validate that `id` is non-empty and that we only reference known assets (no arbitrary URLs if we want to keep assets site-controlled).
- **Extensibility**: Optional `category` or `tags` later for filtering. For initial version, a single flat list is enough.

---

## 2. Avatar picker sheet (front end)

- **Component**: `AvatarPickerSheet`, analogous to `ThemePickerSheet`.
  - Uses **ModalSheet**: same `visible` / `onClose` / `title` pattern.
  - **Content**: Load avatar list from config (static import or fetch from public JSON); render a scrollable grid of options.
  - **Selection**: On tap, set chosen avatar (see persistence below), then `onClose()`. Optional "Use initial" option to fall back to initial-based display.
- **Entry points**:
  - **Profile strip**: tap on the avatar circle (lobby and anywhere ProfileStrip is used) opens the picker.
  - **Table hero area**: tap on hero avatar could open the same picker (consistent with “tap avatar” opening a sheet in existing design).
- **Display**:
  - If chosen avatar exists in config: show image (e.g. `Image` with `url` from config).
  - If no choice or invalid id: fall back to initial (current behavior).
- **Accessibility**: Same as theme picker (keyboard/touch, clear selected state, optional `label` for screen readers).

---

## 3. Schema and backend support

Two levels of support are possible.

### Option A — Client-only (MVP, no schema change)

- **Storage**: Persist selected `avatarId` in **preferences store** (e.g. `avatarId: string | null` in `usePreferencesStore`), same persistence as theme.
- **Display**: Only **hero** uses the chosen avatar (ProfileStrip, hero seat, PlayerHistoryPopup when viewing self). **Opponents** continue to use initial only.
- **Pros**: No contract or backend changes; quick to ship; reuses ThemePickerSheet pattern.
- **Cons**: Other players never see your avatar.

### Option B — Full (avatar in snapshot and profile)

- **Contract**: Extend `TableSeatSnapshotSchema` with optional `avatarId?: string`. If present, client resolves `id` → image URL from the same JSON config (so only `id` is broadcast).
- **Hero**: Either add optional `avatarId` to the hero object in the snapshot, or derive hero avatar from the seat entry for `hero.seat` (single source of truth).
- **Engine / room**: When building seat payloads, include `avatarId` per player. This requires a **per-user avatar** to be stored somewhere:
  - **Profile API**: Add `avatarId?: string` to user profile; room reads it when building snapshot (e.g. from same auth/user service).
  - **Or** session/table-level cache keyed by `userId` (e.g. from a small “user preferences” or “table presence” store that the room can read).
- **Join / restore**: When a user joins or restores, backend sends their `avatarId` in the seat (and hero) payload so all clients render the same avatar for that user.
- **Validation**: Backend should only allow `avatarId` values that exist in a server-side allow-list (or the same config) to avoid XSS or broken assets.

**Recommendation**: Implement **Option A** first (picker + JSON config + preferences store + hero-only display), then add **Option B** (schema + profile/store + snapshot) when we want opponents to see each other’s avatars.

---

## 4. Data flow summary

| Scope        | Config        | Where choice is stored     | Where avatar is shown                    |
|-------------|----------------|----------------------------|------------------------------------------|
| Option A    | avatars.json   | Preferences store (client) | Hero only (ProfileStrip, hero seat, popup) |
| Option B    | avatars.json   | Profile API + snapshot     | Hero + all opponents (from seat.avatarId) |

---

## 5. Files to touch (by phase)

### Phase 1 — Config + picker + client-only (Option A)

- Add `apps/client/src/config/avatars.json` (and/or types in `avatars.types.ts`).
- Add `avatarId` (and maybe `setAvatarId`) to `usePreferencesStore`.
- Add `AvatarPickerSheet` (uses `ModalSheet`, reads config, grid, onSelect → setAvatarId + onClose).
- Update **ProfileStrip**: accept optional `avatarId` and avatar list; if `avatarId` set, render image else initial; make avatar circle pressable → open `AvatarPickerSheet`.
- Update **TableLayout** (hero): pass hero `avatarId` from preferences into hero display; tap hero avatar → open `AvatarPickerSheet`.
- Optionally **PlayerHistoryPopup**: if the popup is for the current user, show chosen avatar instead of initial.

### Phase 2 — Schema + backend (Option B)

- **Contract**: `TableSeatSnapshotSchema` + optional `avatarId: z.string().min(1).optional()`; hero object optional `avatarId` or rely on seat.
- **Engine / SnapshotService**: When building seat payload, include `avatarId` from user profile or session store.
- **Profile API**: Add `avatarId` to user model and PATCH/GET so client can save choice and room can read it.
- **Client**: On join or profile update, send `avatarId` to backend; in table adapter, pass `seat.avatarId` into `Opponent` and hero so OpponentStrip and hero zone show images when present.

---

## 6. Edge cases

- **Invalid or removed avatar id**: If stored `avatarId` is not in config (e.g. config changed), fall back to initial and optionally clear stored value.
- **Missing image asset**: If `url` 404s, fall back to initial for that slot and optionally mark config entry as broken in dev.
- **Reconnect / restore**: With Option B, snapshot already includes `avatarId` per seat, so no extra work. With Option A, hero avatar is from preferences and survives reload.
- **Bots**: Bots can have a fixed `avatarId` from config (e.g. "bot-default") or stay initial-based; decision can be deferred.

---

## 7. Open decisions

1. **Asset format**: SVG vs PNG vs both (e.g. `url` points to same id with different extension). SVG scales well for circles; start with one format.
2. **Default avatar**: One config entry with `id: "default"` as the fallback when no choice is set, or keep “no choice” = initial.
3. **Profile API**: If/when we do Option B, confirm whether existing `/me` (or equivalent) supports PATCH for `avatarId` or needs a new endpoint.

---

## 8. Summary

- **Config**: Site avatars in a JSON config (id, url, optional label); single source of truth for valid ids and asset paths.
- **Picker**: New `AvatarPickerSheet` using existing `ModalSheet` and grid pattern; entry from ProfileStrip and hero avatar tap.
- **Schema**: Current schema does **not** support avatars; Option A needs no change; Option B adds optional `avatarId` to seat (and optionally hero) and backend persistence.
- **Phasing**: Implement Option A first (picker + preferences + hero-only), then Option B (contract + profile + snapshot) for full multi-player avatar display.
