export const MOCK_OPPONENTS = [
  { id: "1", name: "Alice", stackCents: 25000, isDealer: true, isActive: false, status: "active" as const, actionLabel: "Check" },
  { id: "2", name: "Bob", stackCents: 15000, isActive: true, status: "active" as const, actionLabel: "Bet $2.50" },
  { id: "3", name: "Charlie", stackCents: 8200, isActive: false, status: "folded" as const },
  { id: "4", name: "Dana", stackCents: 44000, isActive: false, status: "sittingOut" as const },
];

export const MOCK_COMMUNITY_CARDS = [
  { rank: "K", suit: "s" },
  { rank: "9", suit: "h" },
  { rank: "3", suit: "c" },
  null,
  null,
];

export const MOCK_HERO_CARDS = [
  { rank: "Q", suit: "c" },
  { rank: "7", suit: "h" },
];
