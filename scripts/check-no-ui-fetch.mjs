import fs from "node:fs/promises";
import path from "node:path";

const UI_DIR_CANDIDATES = ["apps", "app", "ui", "frontend", "client", "web"];
const FILE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".next", ".vite", ".turbo", ".git", "packages/sdk"]);

async function walk(dir, files = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const relative = path.relative(process.cwd(), full).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(relative) || SKIP_DIRS.has(entry.name)) continue;
      await walk(full, files);
      continue;
    }
    if (FILE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  const root = process.cwd();
  const candidateDirs = UI_DIR_CANDIDATES.map((d) => path.join(root, d));
  const existingDirs = [];
  for (const dir of candidateDirs) {
    try {
      const stat = await fs.stat(dir);
      if (stat.isDirectory()) existingDirs.push(dir);
    } catch {}
  }

  if (existingDirs.length === 0) {
    process.stdout.write("No UI directories found; fetch usage check skipped.\n");
    return;
  }

  const violations = [];
  for (const dir of existingDirs) {
    const files = await walk(dir);
    for (const file of files) {
      const content = await fs.readFile(file, "utf8");
      if (content.includes("fetch(")) {
        violations.push(path.relative(root, file).replaceAll("\\", "/"));
      }
    }
  }

  if (violations.length > 0) {
    process.stderr.write("UI files must use packages/sdk and not call fetch directly:\n");
    for (const file of violations) {
      process.stderr.write(`- ${file}\n`);
    }
    process.exit(1);
  }

  process.stdout.write("No direct fetch() calls found in UI directories.\n");
}

main().catch((err) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
});

