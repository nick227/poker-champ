import { dispatchRealtimeChannelMessage, realtimeChannelRegistry } from "./realtime-channel.registry";

type TableMessageContext = {
  setStatus?: (status: string) => void;
  onError?: (message: string) => void;
};

const tableMessageByKey = realtimeChannelRegistry.byScope.table;
const tableMessageOrdered = Object.entries(tableMessageByKey).map(([key, handler]) => ({ key, handler }));

export const tableMessageRegistry = {
  byKey: tableMessageByKey,
  ordered: tableMessageOrdered,
} as const;

export function dispatchTableMessage(type: string, payload: unknown, context: TableMessageContext) {
  dispatchRealtimeChannelMessage("table", type, payload, context);
}
