import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const offenders = [];

const packageJsonPath = path.join(root, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const scripts = packageJson.scripts ?? {};
for (const [name, value] of Object.entries(scripts)) {
  if (name === "lessons:seed:legacy") continue;
  const text = String(value);
  if (text.includes("lessons:seed:legacy") || text.includes("seed-lessons-v1.ts")) {
    offenders.push(`package.json:scripts.${name}`);
  }
}

const workflowsDir = path.join(root, ".github", "workflows");
if (fs.existsSync(workflowsDir)) {
  const workflowFiles = fs.readdirSync(workflowsDir).filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"));
  for (const file of workflowFiles) {
    const fullPath = path.join(workflowsDir, file);
    const content = fs.readFileSync(fullPath, "utf8");
    if (content.includes("lessons:seed:legacy") || content.includes("seed-lessons-v1.ts")) {
      offenders.push(path.relative(root, fullPath));
    }
  }
}

if (offenders.length > 0) {
  console.error("Legacy lessons V1 seed invocation detected:");
  for (const offender of offenders) {
    console.error(`- ${offender}`);
  }
  process.exit(1);
}

console.log("Legacy seed guard passed.");
