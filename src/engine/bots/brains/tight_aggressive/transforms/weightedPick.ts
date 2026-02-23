export function weightedPick<T extends string>(weights: Partial<Record<T, number>>): T | undefined {
  const entries = Object.entries(weights).filter((entry): entry is [T, number] => typeof entry[1] === "number" && entry[1] > 0);
  if (entries.length === 0) return undefined;
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return entries[0][0];

  let r = Math.random() * total;
  for (const [key, weight] of entries) {
    r -= weight;
    if (r <= 0) return key;
  }
  return entries[entries.length - 1][0];
}
