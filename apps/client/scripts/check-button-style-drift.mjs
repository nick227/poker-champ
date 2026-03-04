import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIRS = [
  path.join(ROOT, "app"),
  path.join(ROOT, "src"),
];

const ALLOWED_EXT = new Set([".ts", ".tsx"]);

const issues = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") continue;
      walk(full);
      continue;
    }
    if (!ALLOWED_EXT.has(path.extname(entry.name))) continue;
    checkFile(full);
  }
}

function addIssue(file, line, rule, snippet) {
  issues.push({ file: path.relative(ROOT, file), line, rule, snippet: snippet.trim() });
}

function checkFile(file) {
  const content = fs.readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);

  function extractTagWindow(startLine, tagName) {
    const chunk = [];
    for (let j = startLine; j < Math.min(startLine + 20, lines.length); j++) {
      chunk.push(lines[j]);
      if (lines[j].includes(">")) break;
    }
    const joined = chunk.join("\n");
    const idx = joined.indexOf(`<${tagName}`);
    return idx >= 0 ? joined.slice(idx) : joined;
  }

  // Rule 1: Button should not carry layout margins via className.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("<Button")) continue;

    const window = extractTagWindow(i, "Button");
    const classNameMatch = window.match(/className\s*=\s*"([^"]+)"/);
    if (classNameMatch && /\bm[trblxy]?-[^\s"]+/.test(classNameMatch[1])) {
      addIssue(file, i + 1, "Button layout margin", classNameMatch[0]);
    }
  }

  // Rule 2: Pressable with onPress + ad-hoc button classes must use btn-*.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("<Pressable")) continue;

    const window = extractTagWindow(i, "Pressable");
    const hasOnPress = /onPress\s*=/.test(window);
    if (!hasOnPress) continue;
    if (/stopPropagation\s*\(/.test(window)) continue;

    const classNameMatch = window.match(/className\s*=\s*"([^"]+)"/);
    if (!classNameMatch) continue;

    const cls = classNameMatch[1];
    const hasBtnClass = /\bbtn\b/.test(cls) || /\bbtn-/.test(cls);
    const hasAdHocButtonStyle = /\b(px-|py-|rounded-(full|md|lg)|bg-)/.test(cls);
    const likelyButtonLike = /\bui-touch\b/.test(cls) || /\brounded-(full|md|lg)\b/.test(cls);
    const hasStructuralHints = /\bflex-1\b|\bbottom-sheet\b|\bui-surface\b|\bself-start\b/.test(cls);

    if (!hasBtnClass && hasAdHocButtonStyle && likelyButtonLike && !hasStructuralHints) {
      addIssue(file, i + 1, "Pressable semantic style drift", classNameMatch[0]);
    }
  }
}

for (const dir of SRC_DIRS) walk(dir);

if (issues.length === 0) {
  console.log("Button style drift check passed.");
  process.exit(0);
}

console.error("Button style drift check failed.\n");
for (const issue of issues) {
  console.error(`- ${issue.file}:${issue.line} [${issue.rule}] ${issue.snippet}`);
}

process.exit(1);
