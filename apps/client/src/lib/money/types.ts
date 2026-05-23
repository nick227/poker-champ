export type UsdCents = number & { readonly __brand: "UsdCents" };
export type ChipAmount = number & { readonly __brand: "ChipAmount" };

export function usdCents(value: number): UsdCents {
  return value as UsdCents;
}

export function chips(value: number): ChipAmount {
  return value as ChipAmount;
}
