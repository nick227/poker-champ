export type TableVisibility = "PUBLIC" | "PRIVATE";

export type TableConfig = {
  tableId: string;
  name: string;
  maxSeats: number; // 2..10
  smallBlindCents: number;
  bigBlindCents: number;
  minBuyInCents: number;
  maxBuyInCents: number;
  visibility: TableVisibility;
  passwordHash?: string;
  speed: "normal" | "fast";
  createdAt: number;
  creatorId?: string;
  showStats: boolean;
};

export type LobbyTableSummary = {
  tableId: string;
  roomId: string;
  name: string;
  players: number;
  maxSeats: number;
  smallBlindCents: number;
  bigBlindCents: number;
  minBuyInCents: number;
  maxBuyInCents: number;
  visibility: TableVisibility;
  speed: "normal" | "fast";
  runningSince?: number;
  createdAt: number;
  creatorId?: string;
  showStats: boolean;
  humanCount?: number;
  connectedHumanCount?: number;
};
