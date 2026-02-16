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
  createdAt: number;
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
  runningSince?: number;
  createdAt: number;
};
