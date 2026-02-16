import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openApiSpec } from "../src/http/openapi.js";

async function main() {
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(dirname, "..");
  const outputPath = path.join(root, "openapi.json");
  await fs.writeFile(outputPath, JSON.stringify(openApiSpec, null, 2) + "\n", "utf8");
  process.stdout.write(`Wrote ${outputPath}\n`);
}

main().catch((err) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
});

