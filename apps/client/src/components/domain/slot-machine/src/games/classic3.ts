import type { SlotGame } from "./types";
import { DEFAULT_PAYOUT_TIERS } from "../engine/tuning";

export const Classic3: SlotGame = {
  id: "classic3",
  name: "Vintage Letters",
  symbols: ["A","B","C","D","E","F","7"],
  reels: [
    ["A","C","B","7","A","D","E","C","B","A","D","F","E","7","B","A","C","D","B","E","A","C","7","B","D","A","E","C","B","A"],
    ["B","A","C","7","D","A","E","C","A","B","D","C","E","7","B","A","C","D","B","F","A","C","7","B","D","A","E","C","B","A"],
    ["C","A","B","7","E","D","A","B","C","A","D","B","E","7","B","A","C","D","B","E","A","F","7","B","D","A","E","C","B","A"],
  ],
  paytable: {
    "A,A,A": 10,
    "B,B,B": 20,
    "C,C,C": 40,
    "D,D,D": 80,
    "E,E,E": 120,
    "F,F,F": 180,
    "7,7,7": 300
  },
  pairPaytable: {
    A: 2,
    B: 3,
    C: 4,
    D: 6,
    E: 8,
    F: 12,
    "7": 15,
  },
  anySevenPayout: 1,
  payoutTiers: DEFAULT_PAYOUT_TIERS,
  jackpotKey: "7,7,7"
};
