import { test as base, expect, type ConsoleMessage } from "@playwright/test";

const FATAL_CONSOLE_PATTERNS = [
  /\bSES_UNCAUGHT_EXCEPTION\b/i,
  /\bES_UNCAUGHT_EXCEPTION\b/i,
  /\bUncaught\b.*\b(Error|ReferenceError|TypeError|SyntaxError)\b/i,
];

function isFatalConsoleMessage(msg: ConsoleMessage): boolean {
  if (msg.type() !== "error") return false;
  const text = msg.text();
  if (/Failed to load resource/i.test(text)) return false;
  return FATAL_CONSOLE_PATTERNS.some((pattern) => pattern.test(text));
}

export const test = base.extend({
  page: async ({ page }, runPage) => {
    const fatalErrors: string[] = [];

    const onConsole = (msg: ConsoleMessage) => {
      if (isFatalConsoleMessage(msg)) {
        fatalErrors.push(`[console] ${msg.text()}`);
      }
    };

    const onPageError = (error: Error) => {
      fatalErrors.push(`[pageerror] ${error.message}`);
    };

    page.on("console", onConsole);
    page.on("pageerror", onPageError);

    await runPage(page);

    page.off("console", onConsole);
    page.off("pageerror", onPageError);

    if (fatalErrors.length > 0) {
      throw new Error(`Fatal browser error(s) detected:\n${fatalErrors.join("\n")}`);
    }
  },
});

export { expect };
export type { APIRequestContext, Page } from "@playwright/test";
