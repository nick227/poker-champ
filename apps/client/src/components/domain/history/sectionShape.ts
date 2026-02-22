import type { Span } from "./layout";

export type TileKey =
  | "totalHands"
  | "winningHands"
  | "losingHands"
  | "breakEvenHands"
  | "netProfit"
  | "avgProfitHand"
  | "bbPer100"
  | "winRate"
  | "profitFactor"
  | "vpip"
  | "pfr"
  | "threeBet"
  | "foldTo3bet"
  | "steal"
  | "foldBbToSteal"
  | "showdownRate"
  | "avgPot"
  | "grossWon"
  | "grossLost"
  | "biggestPot"
  | "biggestWin"
  | "biggestLoss";

export type TileShape = {
  key: TileKey;
  label: string;
  span: Span;
};

export type SectionShape = {
  title: string;
  tiles: TileShape[];
};

export const SECTION_SHAPE: SectionShape[] = [
  {
    title: "Volume",
    tiles: [
      { key: "totalHands", label: "Total Hands", span: "full" },
      { key: "winningHands", label: "Winning Hands", span: "third" },
      { key: "losingHands", label: "Losing Hands", span: "third" },
      { key: "breakEvenHands", label: "Break Even Hands", span: "third" },
    ],
  },

  {
    title: "Profitability",
    tiles: [
      { key: "netProfit", label: "Net Profit", span: "half" },
      { key: "avgProfitHand", label: "Avg Profit / Hand", span: "half" },
      { key: "bbPer100", label: "BB / 100", span: "third" },
      { key: "winRate", label: "Win Rate", span: "third" },
      { key: "profitFactor", label: "Profit Factor", span: "third" },
    ],
  },

  {
    title: "Preflop Tendencies",
    tiles: [
      { key: "vpip", label: "VPIP", span: "third" },
      { key: "pfr", label: "PFR", span: "third" },
      { key: "threeBet", label: "3-Bet", span: "third" },
      { key: "foldTo3bet", label: "Fold to 3-Bet", span: "half" },
      { key: "steal", label: "Steal Attempt", span: "half" },
      { key: "foldBbToSteal", label: "Fold BB to Steal", span: "full" },
    ],
  },

  {
    title: "Hand Outcomes",
    tiles: [
      { key: "showdownRate", label: "Showdown Rate", span: "half" },
      { key: "avgPot", label: "Avg Pot", span: "half" },
      { key: "grossWon", label: "Gross Won", span: "third" },
      { key: "grossLost", label: "Gross Lost", span: "third" },
      { key: "biggestPot", label: "Biggest Pot", span: "third" },
      { key: "biggestWin", label: "Biggest Win", span: "half" },
      { key: "biggestLoss", label: "Biggest Loss", span: "half" },
    ],
  },
];
