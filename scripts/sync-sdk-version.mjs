import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const root = process.cwd();
  const openApiPath = path.join(root, "openapi.json");
  const sdkVersionPath = path.join(root, "packages", "sdk", "src", "version.ts");

  const openApiRaw = await fs.readFile(openApiPath, "utf8");
  const openApi = JSON.parse(openApiRaw);
  const version = String(openApi?.info?.version ?? "0.1.0");

  const content = `export const SDK_VERSION = "${version}";\n`;
  await fs.writeFile(sdkVersionPath, content, "utf8");
  process.stdout.write(`Synced SDK version to ${version}\n`);
}

main().catch((err) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
});

