/** Result message shown in DealerAnnounceBar and used for winner state. */
export type HandResultMessage = {
  winnerName: string;
  amountCents: number;
  winningHandDescr?: string;
};

/** Connection status for table/action bar. */
export type ConnectionStatus = "CONNECTED" | "RECONNECTING" | "DISCONNECTED";
