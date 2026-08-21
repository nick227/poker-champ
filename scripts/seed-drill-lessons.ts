import "dotenv/config";
import { getPrisma, disconnectPrisma } from "@poker-champ/db";

type DrillLessonSeed = {
  id: string;
  slug: string;
  title: string;
  description: string;
  drillType: string;
  questionCount: number;
  difficulty: string;
  estimatedMinutes: number;
  recommendedOrder: number;
};

const DRILL_LESSONS: DrillLessonSeed[] = [
  {
    id: "DRILL_MATCHUP_EQUITY",
    slug: "drill-matchup-equity",
    title: "Matchup Equity Drills",
    description: "Estimate all-in equity between two hands, preflop and on later streets.",
    drillType: "MATCHUP_EQUITY",
    questionCount: 12,
    difficulty: "beginner",
    estimatedMinutes: 5,
    recommendedOrder: 101,
  },
  {
    id: "DRILL_OUT_COUNTING",
    slug: "drill-out-counting",
    title: "Out Counting Drills",
    description: "Count clean outs with both hands and the board visible.",
    drillType: "OUT_COUNTING",
    questionCount: 8,
    difficulty: "beginner",
    estimatedMinutes: 4,
    recommendedOrder: 102,
  },
  {
    id: "DRILL_BET_SIZING",
    slug: "drill-bet-sizing",
    title: "Bet Sizing Drills",
    description: "Convert between pot percentages and dollar bet sizes, both directions.",
    drillType: "BET_SIZING",
    questionCount: 12,
    difficulty: "beginner",
    estimatedMinutes: 4,
    recommendedOrder: 103,
  },
  {
    id: "DRILL_RULE_OF_2_4",
    slug: "drill-rule-of-2-4",
    title: "Rule of 2 & 4 Drills",
    description: "Estimate equity from outs, with one or two cards to come.",
    drillType: "RULE_OF_2_4",
    questionCount: 12,
    difficulty: "beginner",
    estimatedMinutes: 4,
    recommendedOrder: 104,
  },
  {
    id: "DRILL_POT_ODDS",
    slug: "drill-pot-odds",
    title: "Pot Odds Drills",
    description: "Find the equity you need to profitably call, from pot size and call amount.",
    drillType: "POT_ODDS",
    questionCount: 12,
    difficulty: "beginner",
    estimatedMinutes: 4,
    recommendedOrder: 105,
  },
];

async function seedDrillLessons() {
  const prisma = getPrisma();

  for (const drill of DRILL_LESSONS) {
    await prisma.lesson.upsert({
      where: { id: drill.id },
      create: {
        id: drill.id,
        slug: drill.slug,
        title: drill.title,
        description: drill.description,
        moduleCode: "MODULE_D",
        recommendedOrder: drill.recommendedOrder,
        role: "drills",
        repeatable: true,
        difficulty: drill.difficulty,
        status: "PUBLISHED",
        estimatedMinutes: drill.estimatedMinutes,
        version: 1,
        tier: "free",
        format: "DRILL",
        drillConfigJson: { drillType: drill.drillType, questionCount: drill.questionCount },
      },
      update: {
        title: drill.title,
        description: drill.description,
        moduleCode: "MODULE_D",
        recommendedOrder: drill.recommendedOrder,
        role: "drills",
        repeatable: true,
        difficulty: drill.difficulty,
        status: "PUBLISHED",
        estimatedMinutes: drill.estimatedMinutes,
        tier: "free",
        format: "DRILL",
        drillConfigJson: { drillType: drill.drillType, questionCount: drill.questionCount },
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ seededDrillLessons: DRILL_LESSONS.length }, null, 2));
}

seedDrillLessons()
  .then(async () => {
    await disconnectPrisma();
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error("Failed to seed drill lessons:", error);
    await disconnectPrisma();
    process.exit(1);
  });
