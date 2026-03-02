# Awards Inventory

Inventory of awards for the reward system epic. Awards are granted for completing lessons or accomplishing in-game challenges. UX: mobile toaster (graphic | name + reason) and Settings > Awards section grouped by type. Graphics start as unicode for consistency; image packs later.

**Naming**: Award name is tied to the graphic and should feel poker-native and identity-driven. Reason text explains why they got it (e.g. "Completed RFI Discipline By Position").

---

## Rarity system

**Earn type**
- **One-time**: User can earn at most once (per award).
- **Repeatable**: User can earn multiple times (e.g. per hand, per session, per lesson).

**Tier** (emotional weight — drives UX)
- **Common**: High frequency; subtle toaster, light feedback.
- **Uncommon**: Meaningful moment; stronger toaster, optional sound.
- **Rare**: Memorable moment; prominent toaster, sound, possible confetti.
- **Legendary**: Identity-level; max impact (glow, sound, confetti), top of Awards page.

Tier drives: toaster color/glow, sound intensity, confetti level, sort order in Settings (Legendary → Rare → Uncommon → Common).

**Target distribution (launch)**
- 50–70 total awards
- ~60% Common
- ~30% Uncommon
- ~8% Rare
- ~2% Legendary

---

## 1. Lesson completion (one-time per lesson)

| Id | Graphic | Name | Reason template | Trigger | Tier |
|----|---------|------|------------------|--------|------|
| `lesson_complete_L1` | 📍 | Position Pin | Completed RFI Discipline By Position | First completion of L1_open_raise_position_6max | Uncommon |
| `lesson_complete_L2` | ⚡ | Punish Opens | Completed 3-Bet/Call/Fold Buckets | First completion of L2_face_open_3bet_call_fold | Uncommon |
| `lesson_complete_L3` | 🛡️ | Blind Guard | Completed Stop Overfolding Your Big Blind | First completion of L3_blind_defense_bb_vs_btn | Uncommon |
| `lesson_complete_L4` | 🎯 | Isolator | Completed Isolate For EV | First completion of L4_iso_raise_vs_limpers | Uncommon |
| `lesson_complete_L5` | 🌊 | Dry Board Surge | Completed High-Frequency Small C-Bets | First completion of L5_cbet_dry_board | Uncommon |
| `lesson_complete_L6` | ⏸️ | Pot Control | Completed Check-Back Discipline | First completion of L6_check_back_control | Uncommon |
| `lesson_complete_L7` | 📐 | Odds Compass | Completed Draws Without Spew | First completion of L7_draws_and_pot_odds | Uncommon |
| `lesson_complete_L8` | 🔒 | Flop Defense | Completed 3 Flop Defense Leaks | First completion of L8_flop_defense_leaks | Uncommon |
| `lesson_complete_L9` | 🎲 | Turn Barrel | Completed Turn Barrel Discipline | First completion of L9_turn_barrel_or_slow | Uncommon |
| `lesson_complete_L10` | 💎 | Thin Value | Completed Thin Value At 100bb | First completion of L10_river_value_vs_check | Uncommon |
| `lesson_complete_L11` | 🃏 | Bluff Catch | Completed River Bluff-Catch Fundamentals | First completion of L11_bluff_catch_fundamentals | Uncommon |
| `lesson_complete_L12` | 👑 | Capstone | Completed Capstone Hand Review | First completion of L12_capstone_mixed_spot | Uncommon |

---

## 2. Lesson module / curriculum (one-time, identity-driven)

| Id | Graphic | Name | Reason template | Trigger | Tier |
|----|---------|------|------------------|--------|------|
| `first_lesson_ever` | 🦶 | First Step | Completed your first lesson | First completion of any lesson | Common |
| `module_A_done` | 🛑 | Leak Sealed | Finished Module A: Stop Bleeding Preflop | All of L1–L4 completed (first time) | Uncommon |
| `module_B_done` | 🏆 | Flop Technician | Finished Module B: Win More Flops | All of L5–L8 completed (first time) | Uncommon |
| `module_C_done` | ✅ | Closer | Finished Module C: Close The Hand Profitably | All of L9–L12 completed (first time) | Uncommon |
| `curriculum_done` | 🎓 | Structured Player | Completed Phase 1 Curriculum | All 12 lessons completed (first time) | Rare |

---

## 3. Lesson performance (tiered escalation)

| Id | Graphic | Name | Reason template | Trigger | Earn type | Tier |
|----|---------|------|------------------|--------|-----------|------|
| `lesson_sharp` | 🥈 | Sharp | Scored 95–99% on {lessonTitle} | scorePct 95–99 for a lesson | Repeatable | Common |
| `lesson_perfect` | 💯 | Perfect | Perfect score on {lessonTitle} | scorePct === 100 for a lesson (any attempt) | Repeatable | Uncommon |
| `lesson_clinician` | 🧠 | Clinician | Perfect on 5 different lessons | 5 distinct lessons with at least one 100% attempt | One-time | Rare |
| `lesson_first_try` | 🎯 | First Try | Nailed {lessonTitle} on first attempt | Completed lesson with no incorrect step in that attempt | One-time per lesson | Uncommon |

---

## 4. In-game: session hands (repeatable, poker-native names)

| Id | Graphic | Name | Reason template | Trigger | Tier |
|----|---------|------|------------------|--------|------|
| `hands_10` | 🔥 | Getting Warm | Played 10 hands this session | Session hands dealt ≥ 10 | Common |
| `hands_50` | 📊 | In The Mix | Played 50 hands this session | Session hands dealt ≥ 50 | Common |
| `hands_100` | 💯 | Locked In | Played 100 hands this session | Session hands dealt ≥ 100 | Common |

---

## 5. In-game: lifetime hand milestones (identity ladder)

| Id | Graphic | Name | Reason template | Trigger | Tier |
|----|---------|------|------------------|--------|------|
| `hands_100_life` | 🧱 | Grinder I | 100 lifetime hands played | Lifetime hands dealt ≥ 100 | Common |
| `hands_500_life` | 🏗️ | Grinder II | 500 lifetime hands played | Lifetime hands dealt ≥ 500 | Uncommon |
| `hands_1000_life` | 🏛️ | Grinder III | 1000 lifetime hands played | Lifetime hands dealt ≥ 1000 | Uncommon |
| `hands_5000_life` | 🏔️ | Iron Volume | 5000 lifetime hands played | Lifetime hands dealt ≥ 5000 | Legendary |

---

## 6. In-game: wins and moments (one-time + repeatable)

| Id | Graphic | Name | Reason template | Trigger | Earn type | Tier |
|----|---------|------|------------------|--------|-----------|------|
| `first_hand_played` | 🃏 | First Hand | Played your first hand | First hand user was dealt in | One-time | Common |
| `first_win` | 🏅 | First Win | Won your first hand | First hand with net payout > 0 | One-time | Common |
| `win_streak_2` | 🔥 | Double Up | Won 2 hands in a row | Consecutive hand wins (session) | Repeatable | Common |
| `showdown_win` | 👁️ | Showdown | Won at showdown | Won hand that went to showdown | Repeatable | Common |
| `all_in_win` | 🎰 | All-In Win | Won an all-in | Won hand where hero was all-in | Repeatable | Common |
| `big_pot_win` | 💰 | Big Pot | Won pot ≥ 50bb | Won hand with pot size ≥ 50bb | Repeatable | Uncommon |

---

## 7. Clutch awards (rare, high-dopamine moments)

| Id | Graphic | Name | Reason template | Trigger | Tier |
|----|---------|------|------------------|--------|------|
| `rivered_win` | 🌊 | River Miracle | Won after being behind on turn | Won hand where hero was behind on turn (equity) and won at showdown | Rare |
| `cooler_survivor` | 🧊 | Cooler Survivor | Lost with top 2% hand | Lost at showdown with hand in top ~2% (e.g. top set, nut flush) | Rare |
| `hero_call` | 🧠 | Hero Call | Called and won vs missed bluff | Called river bet and won; villain had air / missed draw | Rare |
| `comeback_session` | 🔄 | Comeback | Down 50bb, ended session positive | Session: was down ≥ 50bb at some point, ended with net positive | Rare |

---

## 8. Discipline awards (align with curriculum philosophy)

| Id | Graphic | Name | Reason template | Trigger | Tier |
|----|---------|------|------------------|--------|------|
| `fold_big_pair` | 🗑️ | Discipline Fold | Folded overpair vs strong line | Folded overpair (e.g. AA/KK/QQ) facing a strong line (e.g. raise or all-in) and was correct | Rare |
| `check_back_tp` | 🧘 | Controlled | Checked back top pair | Checked back top pair in a pot-control spot (e.g. dry board, multiway) | Rare |
| `no_tilt_session` | 🧊 | Ice Cold | No all-ins after 3 losses | Session: lost 3+ hands in a row and did not go all-in in the next 10 hands | Rare |

---

## 9. Replay / analytical behavior

| Id | Graphic | Name | Reason template | Trigger | Tier |
|----|---------|------|------------------|--------|------|
| `first_replay` | ▶️ | First Replay | Watched your first hand replay | First time user opened replay for a hand | One-time, Common |
| `replays_5` | 📺 | Replay Fan | Watched 5 hand replays | Total replays viewed ≥ 5 | One-time, Common |
| `replays_25` | 🎬 | Replay Buff | Watched 25 hand replays | Total replays viewed ≥ 25 | One-time, Uncommon |
| `replay_self_loss` | 🔍 | Self Review | Watched replay of a losing hand | Watched replay of a hand where hero lost money | One-time or repeatable | Uncommon |
| `replay_big_pot` | 🎥 | Film Study | Watched replay of ≥30bb pot | Watched replay of hand with pot ≥ 30bb | One-time or repeatable | Uncommon |

---

## 10. In-game: session stats (repeatable)

Session stats (VPIP/PFR) are in-memory today; awards are session-scoped.

| Id | Graphic | Name | Reason template | Trigger | Tier |
|----|---------|------|------------------|--------|------|
| `session_vpip_tight` | 🎚️ | Tight Session | VPIP ≤ 22% over 20+ hands | Session: hands ≥ 20, vpipPct ≤ 22 | Common |
| `session_pfr_aggressive` | 📈 | Aggressor | PFR ≥ 18% over 20+ hands | Session: hands ≥ 20, pfrPct ≥ 18 | Common |

---

## 11. Concept / mastery (tiered)

| Id | Graphic | Name | Reason template | Trigger | Tier |
|----|---------|------|------------------|--------|------|
| `concept_first_mastery` | 📈 | Concept Up | First concept bar increase | Any UserConceptMastery score increased after a lesson | One-time, Common |
| `concept_aware` | 📍 | Position Aware / Odds Aware / … | {conceptName} concept ≥ 1.0 | Any single concept mastery ≥ 1.0 (one-time per concept or first time hitting 1.0) | Uncommon |
| `concept_student` | 📚 | Student | {conceptName} concept ≥ 2.0 | Any single concept mastery ≥ 2.0 | Uncommon |
| `concept_thinker` | 🧠 | Thinker | {conceptName} concept ≥ 3.0 | Any single concept mastery ≥ 3.0 | Rare |
| `concept_strategist` | 🎓 | Strategist | {conceptName} concept ≥ 5.0 | Any single concept mastery ≥ 5.0 | Legendary |
| `biggest_leak_viewed` | 🔍 | Leak Check | Checked your biggest leak | User opened/dismissed "biggest leak" banner | Repeatable or one-time per update | Common |

---

## 12. Engagement / retention (meaningful behavior)

| Id | Graphic | Name | Reason template | Trigger | Tier |
|----|---------|------|------------------|--------|------|
| `first_week_streak` | 📅 | Consistent | Played 7 consecutive days | Played at least one hand on 7 consecutive calendar days | One-time, Uncommon |
| `return_after_7_days` | 🔁 | Back At It | Returned after 7+ day gap | First session after 7+ days without playing | One-time (per return), Common |
| `five_sessions_week` | 📆 | Active Week | 5 sessions in 7 days | 5 distinct sessions (table join or hands played) within rolling 7 days | Repeatable, Uncommon |

---

## Summary

| Category | Count | One-time | Repeatable |
|----------|-------|----------|------------|
| Lesson completion | 12 | 12 | 0 |
| Module / curriculum | 5 | 5 | 0 |
| Lesson performance | 4 | 1 + 12 (first try) | 2 (sharp, perfect) |
| Session hands | 3 | 0 | 3 |
| Lifetime hands | 4 | 4 | 0 |
| Wins and moments | 6 | 2 | 4 |
| Clutch | 4 | 4 | 0 |
| Discipline | 3 | 3 | 0 |
| Replay | 5 | 3 | 2 (or mixed) |
| Session stats | 2 | 0 | 2 |
| Concept / mastery | 6 | 4+ | 1 |
| Engagement | 3 | 2 | 1 |
| **Total** | **~57** | **~42** | **~15** |

**Tier distribution (target)**  
- Common: ~35 (≈61%)  
- Uncommon: ~17 (≈30%)  
- Rare: ~4 (≈7%)  
- Legendary: ~2 (≈4%)

Adjust individual award tiers as needed so launch totals land in 50–70 with ~60% Common, ~30% Uncommon, ~8% Rare, ~2% Legendary.

---

## Implementation notes (for later)

- **Graphic**: Store unicode char or graphic key (e.g. `trophy_capstone`); client maps to unicode or image pack asset.
- **Reason**: Template with placeholders (e.g. `{lessonTitle}`, `{conceptName}`) filled at grant time.
- **Grouping in Settings**: By type (Lessons, Module, In-Game, Lifetime, Clutch, Discipline, Replay, Mastery, Engagement) or by source; sort by Tier (Legendary first) then by category.
- **Earn type + Tier**: One-time/Repeatable drives "New" vs "Earned again" and count; Tier drives toaster/sound/confetti and list order.
- **Grant pipeline**: Lesson completion, hand end, replay view, session end, daily streak / return logic → award service; write to `UserAward` (or equivalent) and emit toaster.
