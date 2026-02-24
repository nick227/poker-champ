export type ChatMessageForOverlay = {
  id: string;
  sender: string;
  text: string;
  isSelf: boolean;
  createdAtTs?: number;
};

export type UseChatOverlayParams = {
  scopeKey: string;
  messages: ChatMessageForOverlay[];
  onSend: (text: string) => void;
  onLoadOlder?: () => void;
  hasMore?: boolean;
  loadingOlder?: boolean;
  maxMessages?: number;
};

