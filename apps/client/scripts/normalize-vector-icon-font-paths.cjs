const fs = require("fs");
const path = require("path");

const DIST_DIR = path.resolve(__dirname, "..", "dist");
const JS_DIR = path.join(DIST_DIR, "_expo", "static", "js");
const FONTS_OUT_DIR = path.join(DIST_DIR, "assets", "fonts");

const FONT_URL_PATTERN =
  /\/assets\/__node_modules\/\.pnpm\/[^"'\\\s]+\/node_modules\/@expo\/vector-icons\/build\/vendor\/react-native-vector-icons\/Fonts\/([A-Za-z0-9_]+\.[a-f0-9]+\.(?:ttf|otf))/g;

function walkFiles(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, ext, out);
      continue;
    }
    if (entry.isFile() && full.endsWith(ext)) out.push(full);
  }
  return out;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyIfNeeded(src, dest) {
  ensureDir(path.dirname(dest));
  if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
}

function normalizeBundle(bundlePath) {
  let code = fs.readFileSync(bundlePath, "utf8");
  const matches = [...code.matchAll(FONT_URL_PATTERN)];
  if (matches.length === 0) return { changed: false, rewritten: 0 };

  let rewritten = 0;
  for (const match of matches) {
    const fullUrl = match[0];
    const fileName = match[1];
    const fromAbs = path.join(DIST_DIR, fullUrl.slice(1).replaceAll("/", path.sep));
    const toAbs = path.join(FONTS_OUT_DIR, fileName);
    if (fs.existsSync(fromAbs)) {
      copyIfNeeded(fromAbs, toAbs);
    }
    const toUrl = `/assets/fonts/${fileName}`;
    if (code.includes(fullUrl)) {
      code = code.split(fullUrl).join(toUrl);
      rewritten += 1;
    }
  }

  fs.writeFileSync(bundlePath, code, "utf8");
  return { changed: true, rewritten };
}

function main() {
  const jsFiles = walkFiles(JS_DIR, ".js");
  if (jsFiles.length === 0) {
    console.log("[normalize-vector-icons] No JS bundles found, skipping.");
    return;
  }

  let changedFiles = 0;
  let rewrittenRefs = 0;
  for (const file of jsFiles) {
    const result = normalizeBundle(file);
    if (!result.changed) continue;
    changedFiles += 1;
    rewrittenRefs += result.rewritten;
  }

  if (changedFiles === 0) {
    console.log("[normalize-vector-icons] No vector-icon font URLs needed normalization.");
    return;
  }

  console.log(
    `[normalize-vector-icons] Rewrote ${rewrittenRefs} font URL references across ${changedFiles} bundle file(s).`,
  );
}

main();
