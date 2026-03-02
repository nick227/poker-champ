import type { AwardCatalogEntry, AwardSource, AwardTier } from "./types.js";
import { TIER_WEIGHT } from "./types.js";

const CATALOG_VERSION = 1;

function entry(
  id: string,
  name: string,
  reasonTemplate: string,
  graphic: string,
  tier: AwardTier,
  priorityWeight: number,
  earnType: "ONE_TIME" | "REPEATABLE",
  category: string,
  source: AwardSource = "LESSON"
): AwardCatalogEntry {
  return {
    id,
    name,
    reasonTemplate,
    graphic: graphic.startsWith("emoji:") ? graphic : `emoji:${graphic}`,
    tier,
    tierWeight: TIER_WEIGHT[tier],
    priorityWeight,
    earnType,
    source,
    category,
    version: CATALOG_VERSION,
  };
}

/** Phase 1: lesson-related awards only. entry() adds emoji: prefix to graphic. */
const LESSON_CATALOG: AwardCatalogEntry[] = [
  entry("lesson_complete_L1", "Position Pin", "Completed RFI Discipline By Position", "📍", "UNCOMMON", 80, "ONE_TIME", "PROGRESSION"),
  entry("lesson_complete_L2", "Punish Opens", "Completed 3-Bet/Call/Fold Buckets", "⚡", "UNCOMMON", 80, "ONE_TIME", "PROGRESSION"),
  entry("lesson_complete_L3", "Blind Guard", "Completed Stop Overfolding Your Big Blind", "🛡️", "UNCOMMON", 80, "ONE_TIME", "PROGRESSION"),
  entry("lesson_complete_L4", "Isolator", "Completed Isolate For EV", "🎯", "UNCOMMON", 80, "ONE_TIME", "PROGRESSION"),
  entry("lesson_complete_L5", "Dry Board Surge", "Completed High-Frequency Small C-Bets", "🌊", "UNCOMMON", 80, "ONE_TIME", "PROGRESSION"),
  entry("lesson_complete_L6", "Pot Control", "Completed Check-Back Discipline", "⏸️", "UNCOMMON", 80, "ONE_TIME", "PROGRESSION"),
  entry("lesson_complete_L7", "Odds Compass", "Completed Draws Without Spew", "📐", "UNCOMMON", 80, "ONE_TIME", "PROGRESSION"),
  entry("lesson_complete_L8", "Flop Defense", "Completed 3 Flop Defense Leaks", "🔒", "UNCOMMON", 80, "ONE_TIME", "PROGRESSION"),
  entry("lesson_complete_L9", "Turn Barrel", "Completed Turn Barrel Discipline", "🎲", "UNCOMMON", 80, "ONE_TIME", "PROGRESSION"),
  entry("lesson_complete_L10", "Thin Value", "Completed Thin Value At 100bb", "💎", "UNCOMMON", 80, "ONE_TIME", "PROGRESSION"),
  entry("lesson_complete_L11", "Bluff Catch", "Completed River Bluff-Catch Fundamentals", "🃏", "UNCOMMON", 80, "ONE_TIME", "PROGRESSION"),
  entry("lesson_complete_L12", "Capstone", "Completed Capstone Hand Review", "👑", "UNCOMMON", 80, "ONE_TIME", "PROGRESSION"),
  entry("first_lesson_ever", "First Step", "Completed your first lesson", "🦶", "COMMON", 70, "ONE_TIME", "PROGRESSION"),
  entry("module_A_done", "Leak Sealed", "Finished Module A: Stop Bleeding Preflop (L1–L4)", "🛑", "UNCOMMON", 90, "ONE_TIME", "PROGRESSION"),
  entry("module_B_done", "Flop Technician", "Finished Module B: Win More Flops (L5–L8)", "🏆", "UNCOMMON", 90, "ONE_TIME", "PROGRESSION"),
  entry("module_C_done", "Closer", "Finished Module C: Close The Hand Profitably (L9–L12)", "✅", "UNCOMMON", 90, "ONE_TIME", "PROGRESSION"),
  entry("curriculum_done", "Structured Player", "Completed Phase 1 Curriculum", "🎓", "RARE", 100, "ONE_TIME", "PROGRESSION"),
  entry("lesson_sharp", "Sharp", "Scored 95–99% on {lessonTitle}", "🥈", "COMMON", 50, "REPEATABLE", "PROGRESSION"),
  entry("lesson_perfect", "Perfect", "Perfect score on {lessonTitle}", "💯", "UNCOMMON", 60, "REPEATABLE", "PROGRESSION"),
  entry("lesson_clinician", "Clinician", "Perfect on 5 different lessons", "🧠", "RARE", 85, "ONE_TIME", "PROGRESSION"),
  entry("lesson_first_try", "First Try", "Nailed {lessonTitle} on first attempt", "🎯", "UNCOMMON", 75, "REPEATABLE", "PROGRESSION"),
];

/** Phase 2: in-game session hands, lifetime hands, wins (inventory §4–6). */
const HAND_CATALOG: AwardCatalogEntry[] = [
  entry("first_hand_played", "First Hand", "Played your first hand", "🃏", "COMMON", 40, "ONE_TIME", "VOLUME", "TABLE"),
  entry("first_win", "First Win", "Won your first hand", "🏅", "COMMON", 45, "ONE_TIME", "VOLUME", "TABLE"),
  entry("hands_10", "Getting Warm", "Played 10 hands this session", "🔥", "COMMON", 10, "REPEATABLE", "VOLUME", "TABLE"),
  entry("hands_50", "In The Mix", "Played 50 hands this session", "📊", "COMMON", 15, "REPEATABLE", "VOLUME", "TABLE"),
  entry("hands_100", "Locked In", "Played 100 hands this session", "💯", "COMMON", 20, "REPEATABLE", "VOLUME", "TABLE"),
  entry("hands_100_life", "Grinder I", "100 lifetime hands played", "🧱", "COMMON", 30, "ONE_TIME", "VOLUME", "TABLE"),
  entry("hands_500_life", "Grinder II", "500 lifetime hands played", "🏗️", "UNCOMMON", 35, "ONE_TIME", "VOLUME", "TABLE"),
  entry("hands_1000_life", "Grinder III", "1000 lifetime hands played", "🏛️", "UNCOMMON", 40, "ONE_TIME", "VOLUME", "TABLE"),
  entry("hands_5000_life", "Iron Volume", "5000 lifetime hands played", "🏔️", "LEGENDARY", 50, "ONE_TIME", "VOLUME", "TABLE"),
  entry("win_streak_2", "Double Up", "Won 2 hands in a row", "🔥", "COMMON", 25, "REPEATABLE", "VOLUME", "TABLE"),
  entry("showdown_win", "Showdown", "Won at showdown", "👁️", "COMMON", 15, "REPEATABLE", "VOLUME", "TABLE"),
  entry("all_in_win", "All-In Win", "Won an all-in", "🎰", "COMMON", 22, "REPEATABLE", "VOLUME", "TABLE"),
  entry("big_pot_win", "Big Pot", "Won pot ≥ 50bb", "💰", "UNCOMMON", 28, "REPEATABLE", "VOLUME", "TABLE"),
];

const BY_ID = new Map<string, AwardCatalogEntry>();
for (const e of [...LESSON_CATALOG, ...HAND_CATALOG]) {
  BY_ID.set(e.id, e);
}

export const awardCatalog = {
  version: CATALOG_VERSION,
  getById(id: string): AwardCatalogEntry | undefined {
    return BY_ID.get(id);
  },
  getAll(): AwardCatalogEntry[] {
    return [...LESSON_CATALOG, ...HAND_CATALOG];
  },
  getLessonCompletionAwardId(lessonId: string): string {
    const prefix = lessonId.split("_")[0];
    return `lesson_complete_${prefix}`;
  },
};

export function resolveReason(template: string, params: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(params)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  return out;
}
