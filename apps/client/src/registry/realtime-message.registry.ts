import { dispatchRealtimeChannelMessage, realtimeChannelRegistry, type TransportState } from "./realtime-channel.registry";

type MessageHandlerContext = {
  onError?: (message: string) => void;
  onSessionRestored?: (userId: string) => void;
  onTableList?: (tables: unknown[]) => void;
  onTransportState?: (state: TransportState) => void;
};

const realtimeMessageByKey = realtimeChannelRegistry.byScope.lobby;
const realtimeMessageOrdered = Object.entries(realtimeMessageByKey).map(([key, handler]) => ({ key, handler }));

export const realtimeMessageRegistry = {
  byKey: realtimeMessageByKey,
  ordered: realtimeMessageOrdered,
} as const;

export function dispatchRealtimeMessage(type: string, payload: unknown, context: MessageHandlerContext) {
  dispatchRealtimeChannelMessage("lobby", type, payload, context);
}
