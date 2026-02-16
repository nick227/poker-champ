
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log("Applying DB-level check constraints...");

    // 1. User bankrollCents >= 0
    await prisma.$executeRawUnsafe(`
      ALTER TABLE User 
      ADD CONSTRAINT check_bankroll_non_negative 
      CHECK (bankrollCents >= 0);
    `);
    console.log("✅ Added CHECK (bankrollCents >= 0) to User table");

    // 2. PlayerBalance balanceCents >= 0
    await prisma.$executeRawUnsafe(`
      ALTER TABLE PlayerBalance 
      ADD CONSTRAINT check_balance_non_negative 
      CHECK (balanceCents >= 0);
    `);
    console.log("✅ Added CHECK (balanceCents >= 0) to PlayerBalance table");

  } catch (err: any) {
    if (err.message.includes("already exists")) {
      console.log("ℹ️ Constraints already exist.");
    } else {
      console.error("❌ Failed to apply constraints:", err);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
