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
  instantGameSeed?: {
    presetId: "MULTIPLAYER_RING" | "HEADS_UP_BOT";
    targetBotCountOverride?: number;
  };
  tournamentId?: string;
  gameMode?: "CASH" | "TOURNAMENT";
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
  runningSince?: number | null;
  createdAt: number;
  updatedAt: number;
  creatorId?: string;
  creatorName: string;
  creatorAvatarUrl: string | null;
  showStats: boolean;
  humanCount?: number;
  connectedHumanCount?: number;
  seatedCount?: number;
};
