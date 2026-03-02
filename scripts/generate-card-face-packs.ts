import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CARD_FACE_PACK_MANIFEST } from "../apps/client/src/assets/cards/packManifest";

const RANK_FILE_NAMES = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "jack", "queen", "king", "ace"] as const;
const SUIT_FILE_NAMES = ["clubs", "diamonds", "hearts", "spades"] as const;
const EXPECTED_CARD_KEYS = SUIT_FILE_NAMES.flatMap((suit) => RANK_FILE_NAMES.map((rank) => `${rank}_of_${suit}`));
const EXPECTED_FILE_NAMES = EXPECTED_CARD_KEYS.map((key) => `${key}.png`);

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const rootDir = path.resolve(scriptsDir, "..");
const clientDir = path.resolve(rootDir, "apps/client");
const clientAssetsCardsDir = path.resolve(clientDir, "assets/cards");
const outputFile = path.resolve(clientDir, "src/assets/cards/generated/cardFacePackRegistry.ts");

function ensureManifestIntegrity() {
  const ids = CARD_FACE_PACK_MANIFEST.map((pack) => pack.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    const uniqueDuplicateIds = [...new Set(duplicateIds)];
    throw new Error(`Duplicate card-face pack ids in manifest: ${uniqueDuplicateIds.join(", ")}`);
  }
}

async function validateLocalPacks() {
  const problems: string[] = [];

  for (const pack of CARD_FACE_PACK_MANIFEST) {
    if (pack.source.type !== "local") continue;

    const folderPath = path.resolve(clientAssetsCardsDir, pack.source.folder);
    let folderEntries: string[] = [];
    try {
      const dirEntries = await fs.readdir(folderPath, { withFileTypes: true });
      folderEntries = dirEntries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    } catch {
      problems.push(`Pack "${pack.id}" folder not found: ${folderPath}`);
      continue;
    }

    const pngFiles = folderEntries.filter((entry) => entry.toLowerCase().endsWith(".png")).sort((a, b) => a.localeCompare(b));
    const expectedSet = new Set(EXPECTED_FILE_NAMES);
    const actualSet = new Set(pngFiles);

    const missing = EXPECTED_FILE_NAMES.filter((name) => !actualSet.has(name));
    const extras = pngFiles.filter((name) => !expectedSet.has(name));

    if (missing.length > 0 || extras.length > 0) {
      const lines = [`Pack "${pack.id}" in folder "${pack.source.folder}" failed validation.`];
      if (missing.length > 0) lines.push(`  Missing (${missing.length}): ${missing.join(", ")}`);
      if (extras.length > 0) lines.push(`  Extra (${extras.length}): ${extras.join(", ")}`);
      problems.push(lines.join("\n"));
    }
  }

  if (problems.length > 0) {
    throw new Error(`Card-face pack validation failed:\n${problems.join("\n\n")}`);
  }
}

function toGeneratedTypeUnion(values: readonly string[]) {
  if (values.length === 0) return "never";
  return values.map((value) => JSON.stringify(value)).join(" | ");
}

function generateRegistrySource() {
  const localPacks = CARD_FACE_PACK_MANIFEST.filter((pack) => pack.source.type === "local");
  const packIds = localPacks.map((pack) => pack.id);

  if (!packIds.includes("default")) {
    throw new Error('Manifest must include a local pack with id "default".');
  }

  const cardFaceKeyType = toGeneratedTypeUnion(EXPECTED_CARD_KEYS);
  const packIdType = toGeneratedTypeUnion(packIds);

  const testPackEntries = localPacks
    .map((pack) => {
      const keyEntries = EXPECTED_CARD_KEYS.map(
        (key) => `      ${JSON.stringify(key)}: ${JSON.stringify(key)} as unknown as ImageSourcePropType,`,
      ).join("\n");
      return `  ${JSON.stringify(pack.id)}: {\n${keyEntries}\n  },`;
    })
    .join("\n");

  const runtimePackEntries = localPacks
    .map((pack) => {
      const keyEntries = EXPECTED_CARD_KEYS.map((key) => {
        const assetRelativePath = `../../../../assets/cards/${pack.source.folder}/${key}.png`;
        return `      ${JSON.stringify(key)}: require(${JSON.stringify(assetRelativePath)}),`;
      }).join("\n");
      return `  ${JSON.stringify(pack.id)}: {\n${keyEntries}\n  },`;
    })
    .join("\n");

  return `import type { ImageSourcePropType } from "react-native";

const isTestEnv = typeof process !== "undefined" && Boolean((process as any).env?.VITEST);

export type CardFaceKey = ${cardFaceKeyType};
export type CardFacePackId = ${packIdType};
export type CardFacePack = Record<CardFaceKey, ImageSourcePropType>;

const generatedCardFacePacks: Record<CardFacePackId, CardFacePack> = isTestEnv
  ? {
${testPackEntries}
    }
  : {
${runtimePackEntries}
    };

export const CARD_FACE_PACKS = generatedCardFacePacks;
export const DEFAULT_CARD_FACE_PACK_ID: CardFacePackId = "default";
`;
}

async function main() {
  ensureManifestIntegrity();
  await validateLocalPacks();

  const source = generateRegistrySource();
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, source, "utf8");

  console.log(`Generated ${path.relative(rootDir, outputFile).replaceAll("\\", "/")} (${CARD_FACE_PACK_MANIFEST.length} manifest entries)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

