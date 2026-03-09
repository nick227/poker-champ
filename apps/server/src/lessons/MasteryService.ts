import type { PrismaClient } from "@prisma/client";
import { clamp01 } from "./utils/objectHelpers.js";

/** Prisma client or transaction client (e.g. from $transaction callback). */
type PrismaOrTx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export interface ConceptLink {
  conceptId: string;
  weight: number;
}

/**
 * Updates user concept mastery for a step's concepts after a graded submission.
 * Uses batch upsert per concept; call inside transaction with tx.
 */
export async function updateMasteryForStep(
  prisma: PrismaOrTx,
  params: {
    userId: string;
    conceptLinks: ConceptLink[];
    isCorrect: boolean;
  },
): Promise<void> {
  const { userId, conceptLinks, isCorrect } = params;
  const now = new Date();
  const masteryDelta = isCorrect ? 0.1 : -0.05;
  const confidenceDelta = isCorrect ? 0.08 : 0.02;

  await Promise.all(
    conceptLinks.map(async (link) => {
      const existing = await prisma.userConceptMastery.findUnique({
        where: {
          userId_conceptId: { userId, conceptId: link.conceptId },
        },
      });
      const weight = Math.max(0.1, link.weight || 1);
      const prevScore = existing?.masteryScore ?? 0;
      const prevConfidence = existing?.confidence ?? 0;
      const nextScore = clamp01(prevScore + masteryDelta * weight);
      const nextConfidence = clamp01(prevConfidence + confidenceDelta * weight);

      await prisma.userConceptMastery.upsert({
        where: {
          userId_conceptId: { userId, conceptId: link.conceptId },
        },
        create: {
          id: `mastery_${userId}_${link.conceptId}`,
          userId,
          conceptId: link.conceptId,
          masteryScore: nextScore,
          confidence: nextConfidence,
          lastUpdatedAt: now,
        },
        update: {
          masteryScore: nextScore,
          confidence: nextConfidence,
          lastUpdatedAt: now,
        },
      });
    }),
  );
}
