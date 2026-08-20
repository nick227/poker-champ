import { create } from "zustand";
import type {
  TableSnapshotPayload,
  ChatMessagePayload,
  BotSummary,
  GiftReceivedPayload,
  SideBetOfferPayload,
  SideBetUpdatePayload,
  SideBetResolvedPayload,
} from "@poker-champ/realtime-contract";

const CHAT_MESSAGES_CAP = 100;
const GIFT_FEED_CAP = 20;

export type SideBetStatus = "PENDING" | "ACTIVE" | "DECLINED" | "CANCELLED" | "EXPIRED" | "COMPLETED" | "VOIDED";

export type SideBetEntry = {
  interactionId: string;
  status: SideBetStatus;
  initiatorUserId: string;
  initiatorName?: string;
  recipientUserId: string;
  catalogKey: string;
  stakeCents: number;
  subjectUserIds?: [string, string];
  subjectNames?: [string, string];
  predictedSubjectUserId?: string;
  expiresAt?: number;
  winnerId?: string | null;
  payoutCents?: number;
  resolutionNote?: string;
};

type TableStoreState = {
  snapshotsByTableId: Record<string, TableSnapshotPayload | undefined>;
  chatMessagesByTableId: Record<string, ChatMessagePayload[]>;
  giftFeedByTableId: Record<string, GiftReceivedPayload[]>;
  sideBetsByTableId: Record<string, Record<string, SideBetEntry>>;
  botSummariesByTableId: Record<string, BotSummary[]>;
  botSummariesUpdatedAtByTableId: Record<string, number>;
  lastSeqByTableId: Record<string, number>;
  connectionStatusByTableId: Record<string, "CONNECTED" | "RECONNECTING" | "DISCONNECTED">;
  activeSessionIdByTableId: Record<string, string | undefined>;
  statusByTableId: Record<string, string | undefined>;
  errorByTableId: Record<string, string | undefined>;
  loadSignalsByTableId: Record<
    string,
    { welcomeAt?: number; sessionRestoreAt?: number; lastSnapshotAt?: number } | undefined
  >;
  markTableWelcome: (tableId: string) => void;
  markTableSessionRestore: (tableId: string) => void;
  clearTableLoadSignals: (tableId: string) => void;
  setSnapshot: (tableId: string, snapshot: TableSnapshotPayload) => void;
  resetSnapshotStream: (tableId: string) => void;
  appendChatMessage: (tableId: string, message: ChatMessagePayload) => void;
  appendGiftEvent: (tableId: string, gift: GiftReceivedPayload) => void;
  upsertSideBetOffer: (tableId: string, offer: SideBetOfferPayload) => void;
  updateSideBetStatus: (tableId: string, update: SideBetUpdatePayload) => void;
  resolveSideBet: (tableId: string, resolved: SideBetResolvedPayload) => void;
  setBotSummaries: (tableId: string, bots: BotSummary[]) => void;
  setConnectionStatus: (tableId: string, status: "CONNECTED" | "RECONNECTING" | "DISCONNECTED") => void;
  clearConnectionStatus: (tableId: string) => void;
  setActiveSessionId: (tableId: string, sessionId: string) => void;
  getActiveSessionId: (tableId: string) => string | undefined;
  clearActiveSessionId: (tableId: string) => void;
  setStatus: (tableId: string, status: string) => void;
  setError: (tableId: string, error: string) => void;
  clearTable: (tableId: string) => void;
};

export const useTableStore = create<TableStoreState>((set, get) => ({
  snapshotsByTableId: {},
  chatMessagesByTableId: {},
  giftFeedByTableId: {},
  sideBetsByTableId: {},
  botSummariesByTableId: {},
  botSummariesUpdatedAtByTableId: {},
  lastSeqByTableId: {},
  connectionStatusByTableId: {},
  activeSessionIdByTableId: {},
  statusByTableId: {},
  errorByTableId: {},
  loadSignalsByTableId: {},
  markTableWelcome: (tableId) =>
    set((s) => ({
      loadSignalsByTableId: {
        ...s.loadSignalsByTableId,
        [tableId]: {
          ...s.loadSignalsByTableId[tableId],
          welcomeAt: Date.now(),
        },
      },
    })),
  markTableSessionRestore: (tableId) =>
    set((s) => ({
      loadSignalsByTableId: {
        ...s.loadSignalsByTableId,
        [tableId]: {
          ...s.loadSignalsByTableId[tableId],
          sessionRestoreAt: Date.now(),
        },
      },
    })),
  clearTableLoadSignals: (tableId) =>
    set((s) => {
      const { [tableId]: _signals, ...loadSignalsByTableId } = s.loadSignalsByTableId;
      return { loadSignalsByTableId };
    }),
  appendChatMessage: (tableId, message) =>
    set((s) => {
      const list = s.chatMessagesByTableId[tableId] ?? [];
      if (list.some((m) => m.id === message.id)) return s;
      const next = [...list, message].slice(-CHAT_MESSAGES_CAP);
      return { chatMessagesByTableId: { ...s.chatMessagesByTableId, [tableId]: next } };
    }),
  appendGiftEvent: (tableId, gift) =>
    set((s) => {
      const list = s.giftFeedByTableId[tableId] ?? [];
      if (list.some((g) => g.interactionId === gift.interactionId)) return s;
      const next = [...list, gift].slice(-GIFT_FEED_CAP);
      return { giftFeedByTableId: { ...s.giftFeedByTableId, [tableId]: next } };
    }),
  upsertSideBetOffer: (tableId, offer) =>
    set((s) => {
      const forTable = s.sideBetsByTableId[tableId] ?? {};
      const entry: SideBetEntry = {
        interactionId: offer.interactionId,
        status: "PENDING",
        initiatorUserId: offer.initiatorUserId,
        initiatorName: offer.initiatorName,
        recipientUserId: offer.recipientUserId,
        catalogKey: offer.catalogKey,
        stakeCents: offer.stakeCents,
        subjectUserIds: offer.subjectUserIds,
        subjectNames: offer.subjectNames,
        predictedSubjectUserId: offer.predictedSubjectUserId,
        expiresAt: offer.expiresAt,
      };
      return { sideBetsByTableId: { ...s.sideBetsByTableId, [tableId]: { ...forTable, [offer.interactionId]: entry } } };
    }),
  updateSideBetStatus: (tableId, update) =>
    set((s) => {
      const forTable = s.sideBetsByTableId[tableId] ?? {};
      const existing = forTable[update.interactionId];
      if (!existing) return s;
      return {
        sideBetsByTableId: {
          ...s.sideBetsByTableId,
          [tableId]: { ...forTable, [update.interactionId]: { ...existing, status: update.status } },
        },
      };
    }),
  resolveSideBet: (tableId, resolved) =>
    set((s) => {
      const forTable = s.sideBetsByTableId[tableId] ?? {};
      const existing = forTable[resolved.interactionId];
      const entry: SideBetEntry = existing
        ? { ...existing, status: "COMPLETED", winnerId: resolved.winnerId, payoutCents: resolved.payoutCents, resolutionNote: resolved.resolutionNote }
        : {
            interactionId: resolved.interactionId,
            status: "COMPLETED",
            initiatorUserId: "",
            recipientUserId: "",
            catalogKey: resolved.catalogKey,
            stakeCents: 0,
            winnerId: resolved.winnerId,
            payoutCents: resolved.payoutCents,
            resolutionNote: resolved.resolutionNote,
          };
      return { sideBetsByTableId: { ...s.sideBetsByTableId, [tableId]: { ...forTable, [resolved.interactionId]: entry } } };
    }),
  setBotSummaries: (tableId, bots) =>
    set((s) => ({
      botSummariesByTableId: {
        ...s.botSummariesByTableId,
        [tableId]: bots,
      },
      botSummariesUpdatedAtByTableId: {
        ...s.botSummariesUpdatedAtByTableId,
        [tableId]: Date.now(),
      },
    })),
  setSnapshot: (tableId, snapshot) =>
    set((s) => {
      const lastSeq = s.lastSeqByTableId[tableId] || 0;
      const isStreamRestart = snapshot.snapshotSeq === 1 && lastSeq > 1;
      if (isStreamRestart) {
        console.warn(
          `[TableStore] Detected snapshot stream restart for table ${tableId}: incoming seq 1 after last ${lastSeq}. Resetting cursor.`,
        );
      }

      if (snapshot.snapshotSeq <= lastSeq) {
        if (isStreamRestart) {
          return {
            snapshotsByTableId: {
              ...s.snapshotsByTableId,
              [tableId]: snapshot,
            },
            lastSeqByTableId: {
              ...s.lastSeqByTableId,
              [tableId]: snapshot.snapshotSeq,
            },
            errorByTableId: {
              ...s.errorByTableId,
              [tableId]: undefined,
            },
          };
        }
        // Drop outdated snapshot
        console.warn(`[TableStore] Dropping outdated snapshot for table ${tableId}: seq ${snapshot.snapshotSeq} <= last ${lastSeq}`);
        return s;
      }
      
      const now = Date.now();
      return {
        snapshotsByTableId: {
          ...s.snapshotsByTableId,
          [tableId]: snapshot,
        },
        lastSeqByTableId: {
          ...s.lastSeqByTableId,
          [tableId]: snapshot.snapshotSeq,
        },
        errorByTableId: {
          ...s.errorByTableId,
          [tableId]: undefined,
        },
        loadSignalsByTableId: {
          ...s.loadSignalsByTableId,
          [tableId]: {
            ...s.loadSignalsByTableId[tableId],
            lastSnapshotAt: now,
          },
        },
      };
    }),
  // Reconnects call this so the next snapshot's sequence number is always accepted (its stream
  // cursor may have restarted) -- setSnapshot's isStreamRestart check already handles accepting a
  // lower/reset seq gracefully, so this only needs to clear the cursor and any stale error, not
  // the snapshot itself. Keeping the last-known snapshot in place means the table view keeps
  // showing real data through the reconnect gap instead of dropping back to a loading placeholder
  // that may never clear if the server doesn't repush a full snapshot on resume.
  resetSnapshotStream: (tableId) =>
    set((s) => {
      const { [tableId]: _lastSeq, ...lastSeqByTableId } = s.lastSeqByTableId;
      const { [tableId]: _error, ...errorByTableId } = s.errorByTableId;
      return { lastSeqByTableId, errorByTableId };
    }),
  setStatus: (tableId, status) =>
    set((s) => ({
      statusByTableId: {
        ...s.statusByTableId,
        [tableId]: status,
      },
    })),
  setConnectionStatus: (tableId, status) =>
    set((s) => ({
      connectionStatusByTableId: {
        ...s.connectionStatusByTableId,
        [tableId]: status,
      },
    })),
  clearConnectionStatus: (tableId) =>
    set((s) => {
      const { [tableId]: _connectionStatus, ...connectionStatusByTableId } = s.connectionStatusByTableId;
      return { connectionStatusByTableId };
    }),
  setActiveSessionId: (tableId, sessionId) =>
    set((s) => ({
      activeSessionIdByTableId: { ...s.activeSessionIdByTableId, [tableId]: sessionId },
    })),
  getActiveSessionId: (tableId): string | undefined => get().activeSessionIdByTableId[tableId],
  clearActiveSessionId: (tableId) =>
    set((s) => {
      const { [tableId]: _, ...activeSessionIdByTableId } = s.activeSessionIdByTableId;
      return { activeSessionIdByTableId };
    }),
  setError: (tableId, error) =>
    set((s) => ({
      errorByTableId: {
        ...s.errorByTableId,
        [tableId]: error,
      },
    })),
  clearTable: (tableId) =>
    set((s) => {
      const { [tableId]: _snapshot, ...snapshotsByTableId } = s.snapshotsByTableId;
      const { [tableId]: _chat, ...chatMessagesByTableId } = s.chatMessagesByTableId;
      const { [tableId]: _gifts, ...giftFeedByTableId } = s.giftFeedByTableId;
      const { [tableId]: _sideBets, ...sideBetsByTableId } = s.sideBetsByTableId;
      const { [tableId]: _bots, ...botSummariesByTableId } = s.botSummariesByTableId;
      const { [tableId]: _botsAt, ...botSummariesUpdatedAtByTableId } = s.botSummariesUpdatedAtByTableId;
      const { [tableId]: _status, ...statusByTableId } = s.statusByTableId;
      const { [tableId]: _error, ...errorByTableId } = s.errorByTableId;
      const { [tableId]: _lastSeq, ...lastSeqByTableId } = s.lastSeqByTableId;
      const { [tableId]: _connectionStatus, ...connectionStatusByTableId } = s.connectionStatusByTableId;
      const { [tableId]: _activeSessionId, ...activeSessionIdByTableId } = s.activeSessionIdByTableId;
      const { [tableId]: _loadSignals, ...loadSignalsByTableId } = s.loadSignalsByTableId;
      return {
        snapshotsByTableId,
        chatMessagesByTableId,
        giftFeedByTableId,
        sideBetsByTableId,
        botSummariesByTableId,
        botSummariesUpdatedAtByTableId,
        statusByTableId,
        errorByTableId,
        lastSeqByTableId,
        connectionStatusByTableId,
        activeSessionIdByTableId,
        loadSignalsByTableId,
      };
    }),
}));
