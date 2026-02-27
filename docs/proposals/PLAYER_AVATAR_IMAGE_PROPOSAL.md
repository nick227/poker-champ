## Player avatar image system (MVP)

### Summary

- **Goal**: Allow players to upload a profile avatar image that appears in table UI with **minimal UI changes**, using **server-side file storage for now** (CDN later), and **client-side downscaling** to reduce bandwidth.
- **MVP constraints**:
  - Max file size: **5 MB** per upload.
  - Max dimensions: **640 px** on the longest side (scaled **client-side** before upload when possible).
  - Supported formats: **JPEG, PNG, WebP** (no animated formats in MVP).
  - Storage: **local server filesystem** under a dedicated avatar root; later swappable to CDN.

---

### Requirements

- **Functional**
  - Players can upload an avatar via a simple profile/settings UI.
  - Table UIs (hero strip + opponents strip + lobby if desired) can render an avatar image when present.
  - Avatar is **optional**; absence falls back to existing initials / color / default silhouette.
  - Changing avatar **updates future tables and lobbies**; existing sessions pick it up without a full reload when feasible.
- **Non-functional**
  - Max upload size 5 MB enforced server-side; client should try to downscale + recompress first.
  - Safe for **rapid reconnects / multiple tabs** (no coupling to table sessions).
  - Path to swap storage backend (CDN, S3, etc.) without schema churn.

---

### Data model / schema

#### 1. User profile fields

Extend the existing user profile (wherever we currently store display name) with **avatar metadata**:

- **`avatarUrl: string | null`**
  - Fully qualified or application-relative URL for the current avatar image.
  - For server storage, e.g. `/avatars/{userId}/{avatarVersion}.jpg`.
- **`avatarVersion: number`**
  - Starts at 1, increments on successful upload.
  - Used for cache busting and optimistic UI updates.
- **`avatarUpdatedAt: Date`**
  - For admin/debug, not required by client.

Implementation options:

- **Option A (likely simplest)**: add columns to existing `User` or `UserProfile` table.
- **Option B**: a small `UserAvatar` table keyed by `userId` with one current row; more flexible for history but overkill for MVP.

MVP recommendation: **Option A** (inline fields on the primary user profile record).

#### 2. Realtime / table payload impact

We only need enough payload to render avatars in table/lobby:

- **Realtime snapshot hero/opponent payloads**:
  - Add optional fields:
    - `avatarUrl?: string`
    - `avatarVersion?: number`
  - These can be hydrated at snapshot-build time from user profile.
  - Clients treat them as **opaque strings**; `avatarVersion` is just for cache invalidation (e.g. query param or React key).

Backward compatibility:

- All new fields are **optional**; older clients ignore them, newer clients display avatar when present.

---

### Server-side file handling

#### 1. Storage layout (MVP, local filesystem, versioned filenames)

Configure a dedicated avatar root, using **versioned filenames as the cache-busting strategy**:

- Root: `<project_root>/var/avatars/`
- Per-user directory: `var/avatars/{userId}/`
- File name: `{avatarVersion}.{ext}` (e.g. `3.jpg`).

Public URL mapping (source of truth stored in DB):

- HTTP route such as `/avatars/{userId}/{file}` statically served from `var/avatars/{userId}/{file}`.
- DB fields:
  - `avatarUrl = /avatars/{userId}/{avatarVersion}.jpg`
  - `avatarVersion = {avatarVersion}`

Later CDN migration:

- A future storage service can change from filesystem to CDN (e.g. S3 + CloudFront) while preserving the `avatarUrl` contract. Only the writer + URL generator change.

#### 2. Upload endpoint

Add a **REST endpoint** for avatar upload, with the **server as source of truth for final bytes**:

- `POST /api/me/avatar`
  - Auth: requires logged-in user (uses existing auth middleware).
  - Request: `multipart/form-data` with:
    - Field: `file` — the image blob.
  - Server-side validations:
    - Hard size cap: reject if `Content-Length` or streamed size > **5 MB**.
    - MIME allowlist: only `image/jpeg`, `image/png`, `image/webp`.
    - **Decode check**: attempt to decode as an image (e.g. via Sharp); reject if decode fails to avoid fake `image/*` streams.
    - (Optional but recommended) **re-encode** via Sharp:
      - Normalize format (e.g. JPEG/WebP).
      - Strip EXIF/metadata for privacy.
      - Enforce a max pixel count to avoid decompression bombs.
  - On success:
    - Compute **next `avatarVersion`** (current + 1, default 1).
    - Save file to `var/avatars/{userId}/{avatarVersion}.{ext}` via storage abstraction.
    - Update user profile `avatarUrl` + `avatarVersion` + `avatarUpdatedAt` in DB.
  - Response body:
    - `{ avatarUrl: string; avatarVersion: number }`.

Error responses (MVP):

- `400` on validation error (type/size).
- `413` if streaming size exceeds 5 MB limit early.
- `500` for unexpected errors (keep body generic).

#### 3. Storage abstraction + security / hygiene

- **Storage abstraction (thin, now)**:
  - `AvatarStorage.save({ userId, version, buffer, ext }) -> { publicUrl }`
  - `AvatarStorage.deletePrevious({ userId, versionToDelete })` (optional)
  - MVP impl: filesystem; later impl: S3/CDN while keeping the same interface.
- Path safety:
  - Never let client control the path; server derives:
    - directory root from userId,
    - file name from `avatarVersion`,
    - extension from validated mime type.
  - Ensure directories are created with safe perms and no directory listing if not desired.
- Abuse / resource control:
  - Strip EXIF and other metadata on re-encode (privacy).
  - Enforce a **max pixel count** when decoding to avoid decompression bombs.
  - Consider soft rate limiting for avatar uploads per user/IP.
  - Delete the prior version file on update (or keep only last N) to cap disk usage.

#### 4. Remove avatar endpoint (nice to have)

- `DELETE /api/me/avatar`
  - Auth: logged-in user.
  - Behavior:
    - Set `avatarUrl = null`.
    - Optionally bump `avatarVersion` (or leave unchanged); `null` avatar is still a distinct state.
    - Optionally delete files via `AvatarStorage.deletePrevious`.
  - Response:
    - `{ avatarUrl: null, avatarVersion }`.

---

### Client behavior & payload

#### 1. Client-side image preparation (MVP)

When user picks a file:

- Validate:
  - `file.size <= 5_000_000` (soft; we still check server-side).
  - `file.type` in `image/jpeg`, `image/png`, `image/webp` (same as server).
- Downscale:
  - Load image into an offscreen `<canvas>`.
  - Compute **max dimension** = 640 px; scale width/height proportionally if either exceeds 640.
- Re-encode via `canvas.toBlob`:
  - If the source has **alpha** (PNG/WebP with transparency), prefer **WebP** output so we keep alpha.
  - Otherwise, output **JPEG** with a baseline quality (e.g. `0.82`) to shrink file size while preserving quality.
- Upload:
  - Use `FormData` with the scaled blob as `file`.
  - POST to `/api/me/avatar`.

If downscaling fails (e.g. older browser, canvas error), fall back to **uploading original** (still capped by 5 MB on server).

#### 2. Client-facing API payloads

- **Upload response**:
  - `{ avatarUrl: string; avatarVersion: number }`.
  - Client updates:
    - Local user/profile store (`currentUser.avatarUrl`, `avatarVersion`).
    - Any in-memory hero context (so current page sees change instantly).
- **Realtime / snapshot**:
  - When building table/lobby snapshots, server includes `avatarUrl` and `avatarVersion` for:
    - hero user,
    - each seat/opponent where available.
  - Clients pass `avatarUrl` down to existing table components via props; components treat it as optional.

---

### UI impact (minimal)

#### 1. Profile / settings UI

- Add a simple **“Avatar”** section on the existing profile/settings screen:
  - Current avatar preview (circle thumbnail).
  - Clicking the avatar (or a small edit icon overlay) opens the file picker directly.
  - Optional “Remove avatar” button (sets `avatarUrl` to null).
- UX is intentionally **ultra light**:
  - User clicks avatar → file picker opens → choose image → we validate and upload.
  - While the upload is in-flight, the avatar thumbnail shows a small spinner overlay.
  - On success, the avatar swaps to the new image using the updated `avatarUrl`.

This is **isolated UI**; no changes to core gameplay flows.

#### 2. Table UI (hero + opponents)

Places where avatars can be rendered with minimal changes:

- Hero strip / HUD (where hero name and stack are already shown).
- `OpponentStrip` entries (each opponent row/card).

Minimal change pattern:

- Add optional `avatarUrl?: string` prop to relevant components.
- If `avatarUrl` present:
  - Render a small circular `<img>` (or background-image) sized e.g. 32–40 px, using `object-fit: cover`.
- If not present:
  - Existing behavior (initials / colored badge / no avatar) stays as-is.
- **Hero/self interaction**:
  - For your own seat/hero row, clicking the avatar uses the same inline flow as settings:
    - Opens the file picker.
    - Shows a spinner overlay inside the avatar while upload is in progress.
    - Swaps to the new image as soon as the upload endpoint returns the new `avatarUrl`.

No layout change is required beyond reserving a small fixed-size avatar slot; text and chips remain the same.

---

### Realtime / caching considerations

- **Cache busting**:
  - Use `avatarVersion` to build URLs when desired:
    - e.g. `/avatars/{userId}/{avatarVersion}.jpg` or `/avatars/{userId}/current.jpg?v={avatarVersion}`.
  - This ensures browsers don’t show stale cached avatars after updates.
- **Realtime updates**:
  - When avatar changes, server updates:
    - user profile,
    - future snapshots (hero/opponents).
  - Existing table sessions naturally pick up new avatar on next snapshot (or next hand), with no special realtime event needed in MVP.

---

### Future enhancements (out of scope for MVP)

- **CDN / external storage**:
  - Replace filesystem writer with S3/GCS or an image CDN; keep `avatarUrl` contract identical.
- **Cropping and aspect ratio tools**:
  - Client-side crop UI to keep consistent aspect ratios.
- **Moderation / content filters**:
  - Flagging, profanity/NSFW detection, admin review tools.
- **Multiple avatar sizes**:
  - Pre-generate small/medium variants server-side for better performance on low bandwidth.

