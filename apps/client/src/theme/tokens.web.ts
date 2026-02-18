/** Auto-generated from tokens.css by scripts/sync-tokens-web.cjs - do not edit */
export const TOKENS_CSS = `/* Design tokens: single source of truth. 4px base scale for spacing.
   Color language: dark base, green accent (primary), gold highlight.
   WCAG AA: --c-text/--c-muted/--c-placeholder on --c-bg/--c-panel meet 4.5:1; use text-text on brand/danger for buttons and badges.
   Readability: All body/label text must use --c-text or --c-muted (or semantic variants). No dark-on-dark. */

:root {
  /* ---- Base (surfaces & neutrals) ---- */
  --c-bg: 0 0% 5%;
  --c-panel: 0 0% 9%;
  --c-panel-elevated: 0 0% 12%;
  --c-border: 0 0% 18%;
  --c-border-subtle: 0 0% 14%;
  --c-edge: 0 0% 14%;

  /* ---- Text ---- */
  --c-text: 0 0% 96%;
  --c-muted: 0 0% 68%;
  --c-placeholder: 0 0% 58%;

  /* ---- Accent (primary green) ---- */
  --c-brand: 158 52% 42%;
  --c-brand-soft: 158 35% 18%;
  --c-brand-bright: 158 55% 50%;

  /* ---- Highlight (gold) ---- */
  --c-gold: 42 82% 50%;
  --c-gold-soft: 42 45% 28%;

  /* ---- Semantic (feedback) ---- */
  --c-danger: 0 78% 55%;
  --c-success: 142 52% 52%;
  --c-warn: 38 85% 52%;

  /* ---- Spacing (4px base: 0,1,2,3,4,5,6,8,10,12,16,20) ---- */
  --s-0: 0;
  --s-1: 4px;
  --s-2: 8px;
  --s-3: 12px;
  --s-4: 16px;
  --s-5: 20px;
  --s-6: 24px;
  --s-8: 32px;
  --s-10: 40px;
  --s-12: 48px;
  --s-16: 64px;
  --s-20: 80px;
  /* Semantic aliases (map to scale) */
  --s-xs: var(--s-1);
  --s-sm: var(--s-2);
  --s-md: var(--s-3);
  --s-lg: var(--s-4);
  --s-xl: var(--s-5);
  --s-2xl: var(--s-6);

  /* ---- Radius (scale + semantic) ---- */
  --r-0: 0;
  --r-1: 4px;
  --r-2: 8px;
  --r-3: 12px;
  --r-4: 16px;
  --r-full: 9999px;
  /* Semantic (tuned for readability) */
  --r-sm: 10px;
  --r-md: 16px;
  --r-lg: 22px;

  /* ---- Poker (table, chips, cards) ---- */
  --c-felt: 158 30% 14%;
  --c-card-face: 0 50% 98%;
  --c-card-back: 217 50% 22%;
  --r-table: 28px;
  --r-card: 8px;
  --c-chip-low: 217 70% 55%;
  --c-chip-mid: 142 52% 45%;
  --c-chip-high: 0 65% 55%;

  /* ---- Table layout (vh-based regions) ---- */
  --table-top: 7vh;
  --table-opponent-max: 22vh;
  --table-dealer: 5vh;
  --table-community: 11vh;
  --table-pot: 4vh;
  --table-hero: 18vh;
  --table-action: 14vh;
}

/* Document: dark theme (in tokens so web build includes it) */
html, body, #root {
  height: 100%;
  margin: 0;
  background-color: hsl(var(--c-bg));
  color: hsl(var(--c-text));
}
body {
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  overflow: hidden;
}
#root {
  display: flex;
  flex: 1;
}

#root, #root div, #root span {
  box-sizing: border-box;
}

#root input, #root textarea, #root select {
  background-color: hsl(var(--c-panel));
  border: 1px solid hsl(var(--c-border-subtle));
  border-radius: var(--r-md);
  color: hsl(var(--c-text));
  padding: var(--s-3);
}

#root input::placeholder, #root textarea::placeholder {
  color: hsl(var(--c-placeholder));
}

#root button, #root [role="button"] {
  background-color: hsl(var(--c-brand));
  color: hsl(var(--c-text));
  border: none;
  border-radius: var(--r-full);
  min-height: 48px;
  padding: 0 var(--s-4);
  font-weight: 500;
}

.bottom-sheet {
  max-width: 100% !important;
  width: 640px !important;
  margin: 0 auto;
}

#root .bg-red-500 {
  background-color: #ef4444 !important;
}`;
