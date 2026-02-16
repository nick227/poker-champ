import { errorRegistry } from "./error.registry";
import { panelRegistry } from "./panel.registry";
import { realtimeChannelRegistry } from "./realtime-channel.registry";
import { realtimeMessageRegistry } from "./realtime-message.registry";
import { screenRegistry } from "./screen.registry";
import { serviceRegistry } from "./service.registry";
import { storeRegistry } from "./store.registry";
import { tableActionRegistry } from "./table-action.registry";
import { tableMessageRegistry } from "./table-message.registry";
import { transportRegistry } from "./transport.registry";

export const registries = {
  error: errorRegistry,
  panel: panelRegistry,
  realtimeChannel: realtimeChannelRegistry,
  realtimeMessage: realtimeMessageRegistry,
  screen: screenRegistry,
  service: serviceRegistry,
  store: storeRegistry,
  tableAction: tableActionRegistry,
  tableMessage: tableMessageRegistry,
  transport: transportRegistry,
} as const;

export * from "./error.registry";
export * from "./panel.registry";
export * from "./realtime-channel.registry";
export * from "./realtime-message.registry";
export * from "./screen.registry";
export * from "./service.registry";
export * from "./sound.registry";
export * from "./store.registry";
export * from "./table-message.registry";
export * from "./table-action.registry";
export * from "./transport.registry";
