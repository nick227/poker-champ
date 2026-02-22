import { execSync } from "child_process";
import { setTimeout } from "timers/promises";

const maxAttempts = 3;
const delayMs = 2000;

for (let attempt = 0; attempt < maxAttempts; attempt++) {
  try {
    execSync("pnpm exec prisma generate", { stdio: "inherit" });
    process.exit(0);
  } catch (err) {
    if (attempt < maxAttempts - 1) {
      console.warn("prisma generate failed (file may be locked on Windows). Retrying in 2s...");
      await setTimeout(delayMs);
    } else {
      process.exit(err.status ?? 1);
    }
  }
}
