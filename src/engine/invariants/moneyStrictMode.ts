export function isMoneyStrictMode(): boolean {
  return process.env.MONEY_STRICT === "1";
}

export function shouldFailClosedMoneyPath(): boolean {
  return isMoneyStrictMode() || process.env.NODE_ENV !== "production";
}

