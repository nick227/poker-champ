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
  updatedAt: number;
  creatorId?: string;
  creatorName: string;
  creatorAvatarUrl: string | null;
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
  updatedAt: number;
  creatorId?: string;
  creatorName: string;
  creatorAvatarUrl: string | null;
  showStats: boolean;
  humanCount?: number;
  connectedHumanCount?: number;
  avgPotCents?: number;
  waitlistCount?: number;
};
