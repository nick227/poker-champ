export type SymbolKey = "A" | "B" | "C" | "D" | "E" | "F" | "7";

export type SlotOutcomeKind = "TRIPLE" | "PAIR" | "ANY_SEVEN" | "NONE";

export type PayoutTier = {
  id: string;
  label: string;
  minProb: number;
};

export type SlotGame = {
  id: string;
  name: string;
  reels: SymbolKey[][];
  symbols: SymbolKey[];
  paytable: Record<string, number>;
  jackpotKey: string;
  pairPaytable?: Partial<Record<SymbolKey, number>>;
  anySevenPayout?: number;
  payoutTiers?: readonly PayoutTier[];
};
