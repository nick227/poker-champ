/**
 * Reads src/theme/tokens.css and writes src/theme/tokens.web.ts so +html and
 * InjectWebTheme can inject it on web. Run after editing tokens.css (or as part of dev:web).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const INPUT = path.join(ROOT, "src", "theme", "tokens.css");
const OUTPUT = path.join(ROOT, "src", "theme", "tokens.web.ts");

const css = fs.readFileSync(INPUT, "utf8");
const escaped = css.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
const out = `/** Auto-generated from tokens.css by scripts/sync-tokens-web.cjs - do not edit */\nexport const TOKENS_CSS = \`${escaped}\`;\n`;
fs.writeFileSync(OUTPUT, out, "utf8");
console.log("Wrote src/theme/tokens.web.ts from tokens.css");
