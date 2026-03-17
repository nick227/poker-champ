export type ActionNotice = {
  key: string;
  handId: string;
  actorUserId?: string;
  message: string;
};

/** Result message shown in DealerAnnounceBar and used for winner state. */
export type HandResultMessage = {
  handId: string;
  winnerName: string;
  amountCents: number;
  winningHandDescr?: string;
};

export type TableDisplayEvents = {
  actionNotice: ActionNotice | null;
  winnerBanner: HandResultMessage | null;
};

/** Connection status for table/action bar. */
export type ConnectionStatus = "CONNECTED" | "RECONNECTING" | "DISCONNECTED";
