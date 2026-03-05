# UI Surface Inventory (Customer Routes, Mobile-First)

## A) Scope and Methodology

### Scope
- Included routes: `/`, `/login`, `/lobby`, `/table/[id]`, `/leaderboard`, `/lessons`, `/lesson/[lessonId]`, `/replay/[handId]`, `/replay/community/[communityId]`, `/settings`, `/slots`, `/blog`, `/blog/[slug]`, `/membership`, `/loading`
- Redirect alias: `/history` -> `/settings` (`apps/client/app/history.tsx`)
- Excluded: `/admin`

### Documentation Interfaces
- `SurfaceType`: semantic category (what)
- `SurfaceStyle`: centralized style slot (how)
- `ComponentKey`: stable component inventory key

### SurfaceStyle Controlled List (v1)
- `surface.app.canvas`
- `surface.screen.base`
- `surface.nav.top`
- `surface.nav.bottom`
- `surface.header.masthead`
- `surface.header.stack`
- `surface.card.primary`
- `surface.card.secondary`
- `surface.list.panel`
- `surface.list.row`
- `surface.prose.article`
- `surface.sheet.modal`
- `surface.dropdown.menu`
- `surface.sim.table`
- `surface.sim.replay`
- `surface.sim.lesson`
- `surface.sim.slots`
- `surface.commerce.section`

## B) SurfaceType Legend

| SurfaceType | Meaning |
|---|---|
| `shell.app` | Global app host |
| `shell.screen` | Safe-area route canvas |
| `nav.top` | Top nav account/balance/online |
| `nav.bottom` | Bottom tab nav |
| `header.brand` | Masthead/brand strip |
| `content.card` | Card/panel sections |
| `content.list` | Repeating rows/lists |
| `content.prose` | Long-form article content |
| `form.auth` | Auth form workflows |
| `feedback.loading` | Loading states |
| `feedback.empty` | Empty states |
| `feedback.error` | Error/retry states |
| `overlay.sheet` | Modal/bottom sheet overlays |
| `overlay.dropdown` | Dropdown overlays |
| `overlay.chat` | Chat overlays |
| `overlay.player-detail` | Player detail overlays |
| `sim.table` | Poker table simulation |
| `sim.replay` | Replay simulation |
| `sim.lesson` | Lesson simulation |
| `sim.slots` | Slots simulation |
| `commerce.sales` | Monetization sections |

### Surface Style Properties (doc-only)

| Property | Allowed Values | Purpose |
|---|---|---|
| `paddingPreset` | `none`, `sm`, `md`, `lg` | rhythm/density |
| `radiusPreset` | `none`, `sm`, `md`, `lg`, `xl` | corner consistency |
| `elevationPreset` | `0`, `1`, `2`, `3` | depth/layering |
| `borderPreset` | `none`, `hairline`, `strong` | separation |
| `bgToken` | `bg.surface.*` | background binding |
| `inkToken` | `text.ink.*` | text/icon binding |
| `stateSet` | `default`, `pressed`, `disabled`, `selected` | interaction states |
| `variantSet` | `default`, `dense` | compact list variant |

## C) Global Shared Surfaces

| ComponentKey | Functional Name | SurfaceType | SurfaceStyle | Source Path | Notes |
|---|---|---|---|---|---|
| `shell.app_shell` | Global app host | `shell.app` | `surface.app.canvas` | `apps/client/src/components/containers/AppShell.tsx` | Root wrapper in `_layout` |
| `shell.screen` | Safe-area route canvas | `shell.screen` | `surface.screen.base` | `apps/client/src/components/containers/Screen.tsx` | Shared route canvas |
| `header.masthead` | Brand masthead | `header.brand` | `surface.header.masthead` | `apps/client/src/components/domain/lobby/Masthead.tsx` | Shared brand header |
| `header.stack_wrapper` | Masthead + top-nav rhythm wrapper | `content.card` | `surface.header.stack` | `apps/client/app/lobby.tsx` | Doc-level spacing/separator control surface |
| `nav.top` | Account/balance/online top nav | `nav.top` | `surface.nav.top` | `apps/client/src/components/domain/navigation/AppTopNav.tsx` | Shared top nav |
| `nav.bottom` | Bottom tab nav | `nav.bottom` | `surface.nav.bottom` | `apps/client/src/components/containers/BottomBar.tsx` | Shared bottom nav |
| `overlay.online_players_sheet` | Online players sheet | `overlay.sheet` | `surface.sheet.modal` | `apps/client/src/components/domain/lobby/OnlinePlayersSheet.tsx` | Shared sheet overlay |
| `overlay.modal_sheet` | Generic modal sheet container | `overlay.sheet` | `surface.sheet.modal` | `apps/client/src/components/containers/ModalSheet.tsx` | Shared sheet primitive |

## D) Page-by-Page Inventory

### `/`
Purpose: auth hydration + redirect.

| ComponentKey | Functional Name | SurfaceType | SurfaceStyle | Source Path | Notes |
|---|---|---|---|---|---|
| `route.index` | Index route gate | `shell.screen` | `surface.screen.base` | `apps/client/app/index.tsx` | Redirect entry |
| `feedback.loading_screen` | Loading screen | `feedback.loading` | `surface.screen.base` | `apps/client/src/components/domain/loading/LoadingScreen.tsx` | Pre-redirect load |

### `/loading`
Purpose: explicit loading route.

| ComponentKey | Functional Name | SurfaceType | SurfaceStyle | Source Path | Notes |
|---|---|---|---|---|---|
| `route.loading` | Loading route wrapper | `shell.screen` | `surface.screen.base` | `apps/client/app/loading.tsx` | Dedicated loading route |
| `feedback.loading_screen` | Loading screen | `feedback.loading` | `surface.screen.base` | `apps/client/src/components/domain/loading/LoadingScreen.tsx` | Shared loading surface |

### `/login`
Purpose: login/register.

| ComponentKey | Functional Name | SurfaceType | SurfaceStyle | Source Path | Notes |
|---|---|---|---|---|---|
| `route.login` | Login route shell | `shell.screen` | `surface.screen.base` | `apps/client/app/login.tsx` | Auth entry |
| `auth.hero` | Auth hero | `content.card` | `surface.card.secondary` | `apps/client/src/components/domain/auth/AuthHero.tsx` | Branding surface |
| `auth.form_panel` | Credential form panel | `form.auth` | `surface.card.primary` | `apps/client/app/login.tsx` | Login/register form |

### `/lobby`
Purpose: table discovery and entry.

| ComponentKey | Functional Name | SurfaceType | SurfaceStyle | Source Path | Notes |
|---|---|---|---|---|---|
| `route.lobby` | Lobby route shell | `shell.screen` | `surface.screen.base` | `apps/client/app/lobby.tsx` | Main route |
| `header.stack_wrapper` | Header stack wrapper | `content.card` | `surface.header.stack` | `apps/client/app/lobby.tsx` | Masthead/nav spacing |
| `header.masthead` | Masthead | `header.brand` | `surface.header.masthead` | `apps/client/src/components/domain/lobby/Masthead.tsx` | Header layer |
| `nav.top` | Top nav | `nav.top` | `surface.nav.top` | `apps/client/src/components/domain/navigation/AppTopNav.tsx` | Header layer |
| `lobby.instant_games` | Instant game launcher | `content.card` | `surface.card.primary` | `apps/client/src/components/domain/lobby/InstantGamePanels.tsx` | Primary CTA card |
| `lobby.game_list` | Table list panel | `content.list` | `surface.list.panel` | `apps/client/src/components/domain/lobby/GameTablePanel.tsx` | List panel surface |
| `lobby.create_game_modal` | Create table modal | `overlay.sheet` | `surface.sheet.modal` | `apps/client/src/components/domain/lobby/CreateGameModal.tsx` | Modal flow |
| `lobby.choose_table_modal` | Join table modal | `overlay.sheet` | `surface.sheet.modal` | `apps/client/src/components/domain/lobby/ChooseTableModal.tsx` | Modal flow |
| `overlay.online_players_sheet` | Online players sheet | `overlay.sheet` | `surface.sheet.modal` | `apps/client/src/components/domain/lobby/OnlinePlayersSheet.tsx` | Shared sheet |
| `nav.bottom` | Bottom nav | `nav.bottom` | `surface.nav.bottom` | `apps/client/src/components/containers/BottomBar.tsx` | Tab nav |

### `/table/[id]`
Purpose: live gameplay + overlays.

| ComponentKey | Functional Name | SurfaceType | SurfaceStyle | Source Path | Notes |
|---|---|---|---|---|---|
| `route.table` | Table route wrapper | `shell.screen` | `surface.screen.base` | `apps/client/app/table/[id].tsx` | Entry wrapper |
| `table.page` | Table page orchestrator | `sim.table` | `surface.sim.table` | `apps/client/src/features/table-page/TablePage.tsx` | Main table controller |
| `table.scene_router` | Table state router | `sim.table` | `surface.sim.table` | `apps/client/src/features/table-page/TableSceneRouter.tsx` | Active/empty/status routing |
| `table.active_view` | Active gameplay view | `sim.table` | `surface.sim.table` | `apps/client/src/components/domain/table/views/ActiveTableView.tsx` | Core simulation plane |
| `table.overlays_sheet` | Table overlay manager | `overlay.sheet` | `surface.sheet.modal` | `apps/client/src/features/table-page/TablePageOverlays.tsx` | Overlay stack |
| `table.active_tables_dropdown` | Active tables dropdown | `overlay.dropdown` | `surface.dropdown.menu` | `apps/client/src/components/domain/table/ActiveTablesDropdown.tsx` | Dropdown overlay |
| `table.chat_overlay` | Chat overlay | `overlay.chat` | `surface.sheet.modal` | `apps/client/src/components/domain/chat/ChatOverlay.tsx` | Chat panel |
| `table.player_history_popup` | Player detail popup | `overlay.player-detail` | `surface.sheet.modal` | `apps/client/src/components/domain/table/PlayerHistoryPopup.tsx` | Player popup |
| `table.theme_picker_sheet` | Theme picker | `overlay.sheet` | `surface.sheet.modal` | `apps/client/src/components/domain/table/ThemePickerSheet.tsx` | Theme sheet |
| `table.bot_picker_sheet` | Bot picker | `overlay.sheet` | `surface.sheet.modal` | `apps/client/src/components/domain/table/BotPickerSheet.tsx` | Bot sheet |
| `nav.bottom` | Bottom nav | `nav.bottom` | `surface.nav.bottom` | `apps/client/src/components/containers/BottomBar.tsx` | Tab nav |

### `/leaderboard`
Purpose: ranked player lists.

| ComponentKey | Functional Name | SurfaceType | SurfaceStyle | Source Path | Notes |
|---|---|---|---|---|---|
| `route.leaderboard` | Leaderboard shell | `shell.screen` | `surface.screen.base` | `apps/client/app/leaderboard.tsx` | Route shell |
| `header.stack_wrapper` | Header stack wrapper | `content.card` | `surface.header.stack` | `apps/client/app/leaderboard.tsx` | Masthead/nav rhythm |
| `leaderboard.entries_list` | Leaderboard rows | `content.list` | `surface.list.row` | `apps/client/app/leaderboard.tsx` | Rank rows |
| `overlay.online_players_sheet` | Online players sheet | `overlay.sheet` | `surface.sheet.modal` | `apps/client/src/components/domain/lobby/OnlinePlayersSheet.tsx` | Shared sheet |
| `nav.bottom` | Bottom nav | `nav.bottom` | `surface.nav.bottom` | `apps/client/src/components/containers/BottomBar.tsx` | Tab nav |

### `/lessons`
Purpose: lessons hub.

| ComponentKey | Functional Name | SurfaceType | SurfaceStyle | Source Path | Notes |
|---|---|---|---|---|---|
| `route.lessons` | Lessons shell | `shell.screen` | `surface.screen.base` | `apps/client/app/lessons.tsx` | Route shell |
| `header.stack_wrapper` | Header stack wrapper | `content.card` | `surface.header.stack` | `apps/client/app/lessons.tsx` | Masthead/nav rhythm |
| `lessons.hero_card` | Lessons hero card | `content.card` | `surface.card.primary` | `apps/client/app/lessons.components.tsx` | Hero surface |
| `lessons.daily_challenges` | Daily challenge list | `content.list` | `surface.list.panel` | `apps/client/app/lessons.components.tsx` | Challenge rows |
| `lessons.modules` | Modules list | `content.list` | `surface.list.panel` | `apps/client/app/lessons.components.tsx` | Module rows |
| `nav.bottom` | Bottom nav | `nav.bottom` | `surface.nav.bottom` | `apps/client/src/components/containers/BottomBar.tsx` | Tab nav |

### `/lesson/[lessonId]`
Purpose: interactive lesson runtime.

| ComponentKey | Functional Name | SurfaceType | SurfaceStyle | Source Path | Notes |
|---|---|---|---|---|---|
| `route.lesson_detail` | Lesson detail shell | `shell.screen` | `surface.screen.base` | `apps/client/app/lesson/[lessonId].tsx` | Route shell |
| `lesson.runtime_content` | Lesson runtime orchestrator | `sim.lesson` | `surface.sim.lesson` | `apps/client/src/features/lessons/LessonContent.tsx` | Runtime state manager |
| `lesson.table_simulation` | Lesson simulation plane | `sim.lesson` | `surface.sim.lesson` | `apps/client/src/features/lessons/LessonContent.tsx` | Embedded simulation |
| `lesson.instructor_panel` | Instructor panel | `content.card` | `surface.card.secondary` | `apps/client/src/features/lessons/LessonInstructorPanel.tsx` | Guidance surface |
| `lesson.question_panel` | Question panel | `content.card` | `surface.card.primary` | `apps/client/src/features/lessons/LessonQuestionPanel.tsx` | Interaction surface |
| `nav.bottom` | Bottom nav | `nav.bottom` | `surface.nav.bottom` | `apps/client/src/components/containers/BottomBar.tsx` | Tab nav |

### `/replay/[handId]`
Purpose: remote hand replay.

| ComponentKey | Functional Name | SurfaceType | SurfaceStyle | Source Path | Notes |
|---|---|---|---|---|---|
| `route.replay_hand` | Replay shell | `shell.screen` | `surface.screen.base` | `apps/client/app/replay/[handId].tsx` | Route shell |
| `header.stack_wrapper` | Header stack wrapper | `content.card` | `surface.header.stack` | `apps/client/app/replay/[handId].tsx` | Masthead rhythm wrapper |
| `header.masthead` | Masthead | `header.brand` | `surface.header.masthead` | `apps/client/src/components/domain/lobby/Masthead.tsx` | Replay header |
| `replay.content` | Replay source router | `sim.replay` | `surface.sim.replay` | `apps/client/src/components/replay/ReplayContent.tsx` | Source adapter router |
| `replay.surface` | Replay visual surface | `sim.replay` | `surface.sim.replay` | `apps/client/src/components/replay/ReplaySurface.tsx` | Replay plane |
| `replay.controls` | Replay controls | `sim.replay` | `surface.sim.replay` | `apps/client/src/components/replay/ReplayControls.tsx` | Scrubber/actions |
| `nav.bottom` | Bottom nav | `nav.bottom` | `surface.nav.bottom` | `apps/client/src/components/containers/BottomBar.tsx` | Tab nav |

### `/replay/community/[communityId]`
Purpose: community snapshot replay.

| ComponentKey | Functional Name | SurfaceType | SurfaceStyle | Source Path | Notes |
|---|---|---|---|---|---|
| `route.replay_community` | Community replay shell | `shell.screen` | `surface.screen.base` | `apps/client/app/replay/community/[communityId].tsx` | Route shell |
| `header.stack_wrapper` | Header stack wrapper | `content.card` | `surface.header.stack` | `apps/client/app/replay/community/[communityId].tsx` | Masthead rhythm wrapper |
| `header.masthead` | Masthead | `header.brand` | `surface.header.masthead` | `apps/client/src/components/domain/lobby/Masthead.tsx` | Replay header |
| `replay.content` | Replay source router | `sim.replay` | `surface.sim.replay` | `apps/client/src/components/replay/ReplayContent.tsx` | Source adapter router |
| `replay.surface` | Replay visual surface | `sim.replay` | `surface.sim.replay` | `apps/client/src/components/replay/ReplaySurface.tsx` | Replay plane |
| `replay.controls` | Replay controls | `sim.replay` | `surface.sim.replay` | `apps/client/src/components/replay/ReplayControls.tsx` | Scrubber/actions |
| `nav.bottom` | Bottom nav | `nav.bottom` | `surface.nav.bottom` | `apps/client/src/components/containers/BottomBar.tsx` | Tab nav |

### `/settings`
Purpose: profile/preferences/awards/history.

| ComponentKey | Functional Name | SurfaceType | SurfaceStyle | Source Path | Notes |
|---|---|---|---|---|---|
| `route.settings` | Settings shell | `shell.screen` | `surface.screen.base` | `apps/client/app/settings.tsx` | Route shell |
| `header.stack_wrapper` | Header stack wrapper | `content.card` | `surface.header.stack` | `apps/client/app/settings.tsx` | Masthead/nav rhythm |
| `settings.profile_avatar` | Profile avatar section | `content.card` | `surface.card.primary` | `apps/client/src/components/domain/settings/ProfileAvatarSection.tsx` | Profile block |
| `settings.preferences_cards` | Settings preference cards | `content.card` | `surface.card.secondary` | `apps/client/app/settings.tsx` | Toggles/actions |
| `settings.awards` | Awards section | `content.card` | `surface.card.secondary` | `apps/client/src/components/domain/settings/AwardsSection.tsx` | Awards block |
| `settings.hand_history` | Hand history section | `content.list` | `surface.list.panel` | `apps/client/src/components/domain/history/HandHistorySection.tsx` | History panel |
| `nav.bottom` | Bottom nav | `nav.bottom` | `surface.nav.bottom` | `apps/client/src/components/containers/BottomBar.tsx` | Tab nav |

### `/slots`
Purpose: slot-machine experience.

| ComponentKey | Functional Name | SurfaceType | SurfaceStyle | Source Path | Notes |
|---|---|---|---|---|---|
| `route.slots` | Slots shell | `shell.screen` | `surface.screen.base` | `apps/client/app/slots.tsx` | Route shell |
| `header.stack_wrapper` | Header stack wrapper | `content.card` | `surface.header.stack` | `apps/client/app/slots.tsx` | Masthead/nav rhythm |
| `slots.machine_surface` | Slot machine surface | `sim.slots` | `surface.sim.slots` | `apps/client/src/components/domain/slot-machine/src/ui/slots/SlotMachine.tsx` | Taxonomy fix from `sim.table` |
| `nav.bottom` | Bottom nav | `nav.bottom` | `surface.nav.bottom` | `apps/client/src/components/containers/BottomBar.tsx` | Tab nav |

### `/blog`
Purpose: article list.

| ComponentKey | Functional Name | SurfaceType | SurfaceStyle | Source Path | Notes |
|---|---|---|---|---|---|
| `route.blog_list` | Blog list shell | `shell.screen` | `surface.screen.base` | `apps/client/app/blog/index.tsx` | Route shell |
| `header.stack_wrapper` | Header stack wrapper | `content.card` | `surface.header.stack` | `apps/client/app/blog/index.tsx` | Masthead/nav rhythm |
| `blog.article_cards_list` | Article card list | `content.list` | `surface.list.panel` | `apps/client/app/blog/index.tsx` | List surface |
| `nav.bottom` | Bottom nav | `nav.bottom` | `surface.nav.bottom` | `apps/client/src/components/containers/BottomBar.tsx` | Tab nav |

### `/blog/[slug]`
Purpose: article detail.

| ComponentKey | Functional Name | SurfaceType | SurfaceStyle | Source Path | Notes |
|---|---|---|---|---|---|
| `route.blog_detail` | Blog detail shell | `shell.screen` | `surface.screen.base` | `apps/client/app/blog/[slug].tsx` | Route shell |
| `header.stack_wrapper` | Header stack wrapper | `content.card` | `surface.header.stack` | `apps/client/app/blog/[slug].tsx` | Masthead/nav rhythm |
| `blog.article_layout` | Article layout | `content.prose` | `surface.prose.article` | `apps/client/src/components/domain/blog/ArticleLayout.tsx` | Prose surface |
| `blog.related_articles` | Related article list | `content.list` | `surface.list.row` | `apps/client/src/components/domain/blog/BlogRelatedArticles.tsx` | Related links |
| `nav.bottom` | Bottom nav | `nav.bottom` | `surface.nav.bottom` | `apps/client/src/components/containers/BottomBar.tsx` | Tab nav |

### `/membership`
Purpose: monetization/sales funnel.

| ComponentKey | Functional Name | SurfaceType | SurfaceStyle | Source Path | Notes |
|---|---|---|---|---|---|
| `route.membership` | Membership shell | `shell.screen` | `surface.screen.base` | `apps/client/app/membership.tsx` | Route shell |
| `membership.hero_offer` | Hero + primary CTA | `commerce.sales` | `surface.commerce.section` | `apps/client/app/membership.tsx` | Conversion block |
| `membership.value_prop` | Value proposition | `commerce.sales` | `surface.commerce.section` | `apps/client/src/components/sales/ValueProposition.tsx` | Sales section |
| `membership.social_proof` | Social proof | `commerce.sales` | `surface.commerce.section` | `apps/client/src/components/sales/SocialProof.tsx` | Trust section |
| `membership.pricing` | Pricing section | `commerce.sales` | `surface.commerce.section` | `apps/client/src/components/sales/PricingSection.tsx` | Pricing section |
| `membership.faq` | FAQ section | `commerce.sales` | `surface.commerce.section` | `apps/client/src/components/sales/FAQSection.tsx` | Objection handling |

## E) Component Cross-Reference Matrix

Priority rubric:
- `P0`: high leverage shared surfaces and simulation shells
- `P1`: route-critical sections with moderate reuse
- `P2`: route-specific sections with lower reuse

Owner rubric:
- `surface-registry`: should be centrally controlled
- `local`: currently local to route
- `mixed`: split between specialized local logic and centralized chrome

| ComponentKey | Functional Name | SurfaceType | SurfaceStyle | Used on Routes | Priority | Owner |
|---|---|---|---|---|---|---|
| `shell.app_shell` | Global app host | `shell.app` | `surface.app.canvas` | all routes via `_layout` | P0 | surface-registry |
| `shell.screen` | Route canvas | `shell.screen` | `surface.screen.base` | all routes | P0 | surface-registry |
| `header.masthead` | Masthead | `header.brand` | `surface.header.masthead` | core app routes | P1 | surface-registry |
| `header.stack_wrapper` | Masthead/top-nav stack wrapper | `content.card` | `surface.header.stack` | `/lobby`, `/leaderboard`, `/lessons`, `/replay/[handId]`, `/replay/community/[communityId]`, `/settings`, `/slots`, `/blog`, `/blog/[slug]` | P0 | surface-registry |
| `nav.top` | Top nav | `nav.top` | `surface.nav.top` | core app routes | P0 | surface-registry |
| `nav.bottom` | Bottom nav | `nav.bottom` | `surface.nav.bottom` | most non-auth routes | P0 | surface-registry |
| `overlay.modal_sheet` | Generic modal sheet | `overlay.sheet` | `surface.sheet.modal` | shared primitive | P0 | surface-registry |
| `overlay.online_players_sheet` | Online players sheet | `overlay.sheet` | `surface.sheet.modal` | `/lobby`, `/leaderboard`, `/lessons`, `/settings`, `/slots`, `/blog`, `/blog/[slug]` | P1 | surface-registry |
| `lobby.game_list` | Lobby table list | `content.list` | `surface.list.panel` | `/lobby` | P1 | surface-registry |
| `lobby.instant_games` | Instant games | `content.card` | `surface.card.primary` | `/lobby` | P1 | mixed |
| `table.page` | Table orchestrator | `sim.table` | `surface.sim.table` | `/table/[id]` | P0 | mixed |
| `table.scene_router` | Table scene router | `sim.table` | `surface.sim.table` | `/table/[id]` | P0 | mixed |
| `table.active_view` | Active table view | `sim.table` | `surface.sim.table` | `/table/[id]` | P0 | mixed |
| `table.overlays_sheet` | Table overlays manager | `overlay.sheet` | `surface.sheet.modal` | `/table/[id]` | P0 | surface-registry |
| `table.active_tables_dropdown` | Active tables dropdown | `overlay.dropdown` | `surface.dropdown.menu` | `/table/[id]` | P1 | surface-registry |
| `table.chat_overlay` | Chat overlay | `overlay.chat` | `surface.sheet.modal` | `/table/[id]` | P1 | mixed |
| `table.player_history_popup` | Player detail popup | `overlay.player-detail` | `surface.sheet.modal` | `/table/[id]` | P1 | surface-registry |
| `replay.content` | Replay source router | `sim.replay` | `surface.sim.replay` | replay routes | P0 | mixed |
| `replay.surface` | Replay surface | `sim.replay` | `surface.sim.replay` | replay routes | P0 | mixed |
| `replay.controls` | Replay controls | `sim.replay` | `surface.sim.replay` | replay routes | P0 | surface-registry |
| `lesson.runtime_content` | Lesson runtime | `sim.lesson` | `surface.sim.lesson` | `/lesson/[lessonId]` | P0 | mixed |
| `lesson.table_simulation` | Lesson simulation plane | `sim.lesson` | `surface.sim.lesson` | `/lesson/[lessonId]` | P0 | mixed |
| `slots.machine_surface` | Slots machine surface | `sim.slots` | `surface.sim.slots` | `/slots` | P1 | mixed |
| `blog.article_layout` | Article layout | `content.prose` | `surface.prose.article` | `/blog/[slug]` | P1 | mixed |
| `blog.related_articles` | Related article list | `content.list` | `surface.list.row` | `/blog/[slug]` | P2 | surface-registry |
| `membership.value_prop` | Value proposition | `commerce.sales` | `surface.commerce.section` | `/membership` | P1 | surface-registry |
| `membership.social_proof` | Social proof | `commerce.sales` | `surface.commerce.section` | `/membership` | P1 | surface-registry |
| `membership.pricing` | Pricing section | `commerce.sales` | `surface.commerce.section` | `/membership` | P1 | surface-registry |
| `membership.faq` | FAQ section | `commerce.sales` | `surface.commerce.section` | `/membership` | P1 | surface-registry |

## F) Enterprise Mobile Readiness Rubric

Use tags on each page/component during redesign planning:
- `touch`: touch target confidence
- `density`: information density and scannability
- `contrast`: text/readability risk
- `overlay`: overlay collision risk
- `scroll`: scroll depth and sticky behavior risk

## Quality Pass Checklist

- [x] Coverage: all requested customer routes appear in Section D.
- [x] `/history` documented as redirect alias only.
- [x] `SurfaceStyle` added to inventory rows in Sections C/D/E.
- [x] `Owner` added to Section E (`surface-registry`, `local`, `mixed`).
- [x] Slots taxonomy fixed to `sim.slots`.
- [x] Header stack control lever added via `header.stack_wrapper` + `surface.header.stack`.
