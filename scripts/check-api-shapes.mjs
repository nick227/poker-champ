import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const OPENAPI_PATH = path.resolve(ROOT, "openapi.json");
const ENDPOINTS_PATH = path.resolve(ROOT, "packages/sdk/src/endpoints.ts");
const SOURCE_HASH_PATH = path.resolve(ROOT, "docs/api-shapes/source.hash");

async function main() {
  const [openapiRaw, endpointsRaw] = await Promise.all([
    fs.readFile(OPENAPI_PATH, "utf8"),
    fs.readFile(ENDPOINTS_PATH, "utf8"),
  ]);

  const expected = crypto.createHash("sha256").update(openapiRaw).update("\n---\n").update(endpointsRaw).digest("hex");
  const current = (await fs.readFile(SOURCE_HASH_PATH, "utf8")).trim();

  if (!current) {
    throw new Error("docs/api-shapes/source.hash is empty. Run: pnpm api:shapes:gen");
  }

  if (current !== expected) {
    throw new Error("API shape docs are stale. Run: pnpm api:shapes:gen and commit updated docs/api-shapes/source.hash");
  }

  console.log("API shape docs are up to date.");
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});
