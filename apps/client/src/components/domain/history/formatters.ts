
export const nfUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function safeNum(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function fmtMoneyFromCents(cents: unknown) {
  return nfUSD.format(safeNum(cents) / 100);
}

export function fmtPct(value: unknown, decimals = 1) {
  const n = safeNum(value, NaN);
  return Number.isFinite(n) ? `${n.toFixed(decimals)}%` : "N/A";
}

export function fmtRatioPct(pct: unknown, made: unknown, opp: unknown, decimals = 1) {
  const o = safeNum(opp, NaN);
  const m = safeNum(made, NaN);
  // Design: show "N/A" when denominator is 0 instead of "0.0% (0/0)".
  if (!Number.isFinite(o) || o === 0) return "N/A";
  return `${fmtPct(pct, decimals)} (${Number.isFinite(m) ? m : 0}/${o})`;
}

export function fmtLossDisplayFromCents(cents: unknown) {
  const abs = Math.abs(safeNum(cents));
  if (abs === 0) return { text: fmtMoneyFromCents(0), className: undefined };
  return { text: `-${fmtMoneyFromCents(abs)}`, className: "text-red-500" };
}
