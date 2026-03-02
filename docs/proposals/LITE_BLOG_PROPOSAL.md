# Lite Blog System Proposal

## 1) Scope

A minimal, read-only blog for poker articles that:

- Connects to **Poker School (lessons)** via in-article links and optional "Related lesson" CTAs.
- May feature **links to the lobby** (e.g. "Practice this at the table").
- Supports **images**, **video**, and **HTML** (sanitized) for rich content.
- Presents a **light, professional** reading experience (Medium.com-style: clean typography, generous whitespace, focus on content).
- Launches with **5–6 backfilled articles**; no CMS or authoring UI in scope.

## 2) Product Goals

- Give users evergreen educational content that complements lessons.
- Drive traffic to lessons and lobby via contextual CTAs.
- Establish a simple, maintainable content surface that can grow later (more articles, optional RSS, etc.) without heavy infrastructure.

## 3) Content Model

### Friendly article URLs

- **List**: `/blog` (no query params for the main view).
- **Article**: `/blog/[slug]` — one slug per article, no numeric IDs in the URL.
- **Slug rules**: Lowercase letters, numbers, hyphens only; human-readable (e.g. `why-position-matters-6max`, `pot-odds-plain-english`). No underscores; no dynamic IDs. Slugs are stable (do not change after publish so links stay valid).

### Article identity

- **Slug** (URL-safe, human-readable id used in the path; e.g. `position-matters-6max`).
- **Title**, **summary** (1–2 sentences), **publishedAt** (ISO date), **updatedAt** (optional).
- **Cover image** (optional): URL or path to static asset.
- **Body**: HTML (sanitized) or Markdown rendered to HTML. Authoring in Markdown recommended; build step or runtime converts to HTML.
- **Optional links**: `relatedLessonIds: string[]`, `featureLobby?: boolean` for lobby CTA placement. **`relatedArticleSlugs?: string[]`** for footer "Related articles" (2–4 other articles); if omitted, derive from manifest order (all others or next N).

### Media

- **Images**: Inline in body (hosted or under `apps/client/assets` / CDN). Responsive (max-width 100%, height auto).
- **Video**: Embed via iframe (YouTube/Vimeo) or `<video>` with sanitized `src`. Same domain or allowlisted origins only.
- **HTML**: Whitelist of tags/attributes (e.g. `p`, `h2`, `h3`, `ul`, `ol`, `li`, `a`, `strong`, `em`, `blockquote`, `figure`, `img`, `iframe` with allowlisted domains). No `script`, `style`, or event handlers.

## 4) Design: Modern, Minimal, Spacious

Blog UI lives inside the **existing app chrome**: `Screen` + **top bar** + **bottom bar** (same as lessons, settings, lobby). No new shell; only the content area and a blog-specific top bar variant.

### Chrome and navigation

- **Top bar (blog context)**  
  - **List page (`/blog`)**: Use same `AppTopNav` as other main screens (avatar, username, bankroll, online) so the blog feels part of the app. Add a **Back** control that goes to the referrer or default (e.g. lobby). Option: left-side back only, or a slim blog header above `AppTopNav` with "← Back" and title "Blog."  
  - **Article page (`/blog/[slug]`)**: **Back at top is required.** Use a **blog article header**: left = back button (router.back() or `/blog`), center or left-aligned = short title ("Blog" or article title). Same vertical slot as `AppTopNav`; can be a slimmer bar (e.g. `BlogTopBar` with back + "Blog" or article title) so the article feels like a focused reading view while still under the main app bars.
- **Bottom bar**: Unchanged. Blog is not a tab; current tab (e.g. Lobby or Lessons) stays active so users can leave blog and land where they expect.
- **Back behavior**: Back from list → previous screen (e.g. lobby). Back from article → list (`/blog`) so users can then choose another article.

### Layout and spacing (minimal, spacious)

- **List (`/blog`)**: Single column. Each article card is a single tappable row: title, 1-line summary, date. **Generous vertical spacing between cards** (e.g. 20–24px). No side-by-side cards; one column keeps it minimal and works in narrow viewports. Optional small "Featured" label on 1–2 cards. Padding: same as other screens (e.g. 16px horizontal), **extra bottom padding** so the last card clears the bottom bar comfortably.
- **Article (`/blog/[slug]`)**:  
  - **Single column, constrained width**: Max-width ~680–720px, centered. Prose never full-bleed on large screens; margins grow to the sides.  
  - **Vertical rhythm**: Section spacing ≥ 24px (e.g. after header, between sections, before footer). Paragraph spacing ~12–16px. No cramped blocks.  
  - **Header block**: Title (one clear size), optional 1-line summary, date (muted), optional cover image. Space below header before body (e.g. 24px).  
  - **Prose**: Comfortable line height (e.g. 1.5–1.6), readable body font size. Headings (h2/h3) get extra margin above. Lists and blockquotes get clear margins.  
  - **Footer**: Dedicated **Related articles** block (see below). Space above footer (e.g. 32px) so it’s clearly the end of the article.

### Visual style (modern minimal)

- **Background**: Same as app (`bg-bg`); no extra panels unless a card is used (e.g. list cards).  
- **Text**: Primary for title and body; muted for date, byline, and meta. One accent color for links and primary CTAs (e.g. "Related lesson", "Play now").  
- **Borders and dividers**: Minimal. Prefer spacing over lines; if needed, use a single subtle divider above the footer.  
- **Images in body**: Responsive (max-width 100%), rounded corners optional (e.g. 8px). Margin above/below so they don’t touch text.  
- **No decorative clutter**: No sidebars, tags cloud, or heavy visuals. Goal: users click through and read; layout supports that.

### Footer: Related articles (click-through)

- **Purpose**: Encourage users to read more; every article should end with a clear "what to read next."
- **Content**: A **Related articles** (or "More to read") section at the bottom of each article. Show **2–4 other articles** (exclude current). Prefer a **curated list** per article via manifest field `relatedArticleSlugs?: string[]`; if missing, fall back to "all other articles" in manifest order (e.g. next 3, or all 5–6 with current omitted).
- **Presentation**: Simple list: title (tappable) and optionally 1-line summary or date. Same spacious rhythm (e.g. 16px between rows). Heading: "Related articles" or "More to read."
- **List page**: On `/blog`, the full list of 5–6 articles is the main content; no need to repeat a "related" block there. Optionally add a short line at the bottom: "Read all articles" (scroll to top or just the list).

### Summary

- **Fits current app**: Same `Screen`, same bottom bar, same top-bar height/slot; blog uses a back-capable top bar on list and article.  
- **Back at top**: Required on both list and article; article back goes to `/blog`.  
- **Modern minimal spacious**: Single column, max-width prose, generous spacing, minimal UI, one accent for links/CTAs.  
- **Footer**: Related articles on every article page to drive click-through and read-all behavior.

## 5) Technical Approach

### Option A: File-based (recommended for lite launch)

- **Source of truth**: Markdown (or HTML) files + a **manifest** (JSON or TypeScript) listing slug, title, summary, dates, relatedLessonIds, cover, etc.
- **Location**: e.g. `apps/client/content/blog/` or `docs/blog/` with manifest at `blogManifest.ts` in client.
- **Build**: At build time (or on first load), manifest is read; article bodies loaded by slug. No backend required for listing/body.
- **Routes**: `/blog` (list), `/blog/[slug]` (article). Client-only; no new API for phase 1.

### Option B: Backend API

- **API**: `GET /api/blog` (list), `GET /api/blog/:slug` (single). Articles stored in DB or in repo and served by server (e.g. from files on disk).
- Use if you prefer auth-gated or analytics on the server, or if you want to add drafts later without client rebuilds.

**Recommendation**: Option A for launch (5–6 articles, no auth requirement for reading). Add API later if you need server-side features.

### Sanitization and rendering

- **Markdown → HTML**: Use a single, well-tested lib (e.g. `react-markdown` with `rehype-sanitize` and allowlisted schema), or pre-render at build time.
- **HTML**: If storing HTML, sanitize with a schema (e.g. `dompurify` + allowlist) before rendering. Restrict `iframe` to known video domains.

### Links to app

- **Lesson**: `router.push(\`/lesson/${lessonId}\`)` or `<Link href={\`/lesson/${lessonId}\`}>`.
- **Lobby**: `router.push("/lobby")` or equivalent.
- **Replay**: Optional link to `/replay/[handId]` or Replay sheet for community hand (same as existing replay links).

## 6) Implementation Plan

### Phase 1: Foundation (no new bottom bar tab)

1. **Content structure**
   - Add `apps/client/content/blog/` (or agreed path).
   - Create `blogManifest.ts`: type `BlogArticleMeta` (slug, title, summary, publishedAt, updatedAt?, cover?, relatedLessonIds?, featureLobby?, **relatedArticleSlugs?**) and array of meta for the 5–6 articles.
   - Add one sample article (e.g. Markdown) and wire manifest to it.

2. **Routes and shell**
   - Use existing `Screen` + bottom bar (no blog tab; active tab stays e.g. Lobby/Lessons). Top bar: blog-specific header with **Back** (and title "Blog" on list, or "Blog" / article title on article).
   - `app/blog/index.tsx`: list page; **Back** at top (e.g. to lobby); reads manifest; single-column card list (title, summary, date), generous spacing between cards; optional "Featured" on 1–2.
   - `app/blog/[slug].tsx`: article page; **Back** at top → `/blog`; resolve slug from manifest, load body; render with shared `ArticleLayout` and **footer = Related articles**.

3. **Article layout and prose**
   - **Top**: Blog header with back button + title (article or "Blog").
   - **Body**: Header block (title, summary, date, optional cover), then prose container (max-width ~720px, spacious vertical rhythm). Optional in-article CTA strip (related lesson, lobby).
   - **Footer**: **Related articles** block: heading "Related articles" or "More to read"; 2–4 links (from `relatedArticleSlugs` or manifest order); each row = tappable title + optional summary/date; spacious spacing. Goal: users click through and read all articles.
   - Prose: render Markdown/HTML with sanitization; style images/video (responsive, allowlisted iframes).

4. **Lobby and lessons integration**
   - Lobby: add "From the blog" or "Read" section with 1–2 featured article links (from manifest or a `featuredSlugs` list).
   - Lessons: optional "Related article" link in lesson intro or in LessonSheet footer for lessons that have a matching `relatedLessonIds` in an article.

5. **Backfill**
   - Write and add the 5–6 articles (see §7) as Markdown (or HTML) + manifest entries. Include at least one image and one video embed in one article to validate pipeline.

### Phase 2 (later, out of scope for launch)

- RSS feed (optional).
- Bottom bar or nav entry for "Blog" if metrics justify it.
- Server API for blog (if needed for auth or server-side analytics).
- Authoring/CMS only if content volume and non-dev authors justify it.

## 7) Suggested First 5–6 Articles

Aligned with your Phase 1 curriculum and lobby/replay features:

| # | Slug | Title | Purpose | Links |
|---|------|--------|--------|--------|
| 1 | `why-position-matters-6max` | Why Position Matters in 6-Max Cash | Core concept; drives preflop discipline | → L1 (open raise), lobby |
| 2 | `3bet-or-fold-stop-flat-calling` | 3-Bet or Fold: Stop Flat-Calling Yourself Into Trouble | Preflop 3-bet/fold; reduces passive flats | → 3-bet lesson, lobby |
| 3 | `how-to-use-hand-replay` | How to Use Hand Replay to Fix Leaks | Replay value and workflow | → Replay your last hand, Community Hand, lobby |
| 4 | `pot-odds-plain-english` | Pot Odds in Plain English | Foundational; supports flop decisions | → Flop pot odds lesson, lobby |
| 5 | `building-preflop-opening-range` | Building a Preflop Opening Range (6-Max) | RFI by position; ties to L1 | → L1, lessons index, lobby |
| 6 | `practice-to-tables` | From Practice to Tables: Getting the Most From Poker School | How to combine lessons + play | → Lessons, lobby, replay |

All can include 1–2 images (e.g. position diagram, range chart) and one optional short video (e.g. "Replay walkthrough" for article 3). Article 6 works well as a short, CTA-focused piece that ties lessons and lobby together.

## 8) Acceptance Criteria (Phase 1)

- [ ] **Friendly URLs**: `/blog` for list; `/blog/[slug]` for articles (human-readable slugs only, no numeric IDs).
- [ ] Blog list and article screens use existing `Screen` + top bar + bottom bar; no new bottom bar tab.
- [ ] **Back at top** on both `/blog` and `/blog/[slug]`; article back goes to `/blog`.
- [ ] `/blog` shows a single-column list of 5–6 articles (title, summary, date), minimal and spacious.
- [ ] `/blog/[slug]` renders full article (title, summary, date, optional cover, body with images/video/HTML), then **footer = Related articles** (2–4 other articles, tappable) so users are encouraged to click through and read all.
- [ ] All article body content is sanitized (no script/style/unsafe iframes).
- [ ] Lobby has a small "From the blog" (or similar) block with at least one link to an article.
- [ ] At least one lesson (e.g. L1) can show an optional "Related article" link when an article references it.
- [ ] First 5–6 articles backfilled and readable.

## 9) Out of Scope (Launch)

- Comments, likes, or social features.
- CMS or admin UI for creating/editing articles.
- Auth-gated articles.
- Blog tab in bottom nav.
- Full-site RSS (can add later).

## 10) File Checklist (Phase 1)

- `docs/proposals/LITE_BLOG_PROPOSAL.md` (this document).
- `apps/client/content/blog/` (or equivalent): one manifest file + 5–6 article bodies (e.g. `.md`).
- `apps/client/app/blog/index.tsx` (list).
- `apps/client/app/blog/[slug].tsx` (article).
- Shared components: e.g. `BlogTopBar` (back + title), `ArticleLayout` (header + prose + related-articles footer), `BlogProse` (Markdown/HTML + sanitization), `BlogRelatedArticles` (footer links), optional `BlogCtaStrip` (lesson/lobby).
- Lobby: add featured blog links (component or section in `lobby.tsx`).
- Optional: lesson → related-article link (in lesson meta or LessonSheet) for lessons present in article `relatedLessonIds`.

---

*Proposal written for lite launch with 5–6 backfilled articles, Medium-style reading experience, and clear links to lessons and lobby.*
