import type { HeroActionOptions } from "@poker-champ/realtime-contract";

export type ActionBarConnectionStatus = "CONNECTED" | "RECONNECTING" | "DISCONNECTED" | undefined;

export function resolvePrimaryWagerAction(o?: HeroActionOptions): "BET" | "RAISE" | undefined {
  if (!o) return undefined;
  if (o.primaryWagerAction === "BET" || o.primaryWagerAction === "RAISE") return o.primaryWagerAction;
  return undefined;
}

export function getActionBarAvailability(params: {
  isMyTurn: boolean;
  actionOptions?: HeroActionOptions;
  connectionStatus?: ActionBarConnectionStatus;
}): { showActions: boolean; actionsEnabled: boolean } {
  const canActFromServer = params.isMyTurn && !!params.actionOptions;
  const isConnectionBlockingActions =
    params.connectionStatus === "RECONNECTING" || params.connectionStatus === "DISCONNECTED";

  return {
    showActions: canActFromServer,
    actionsEnabled: canActFromServer && !isConnectionBlockingActions,
  };
}

export function buildWagerActionPayload(
  options: HeroActionOptions | undefined,
  amount: number,
): { type: "BET" | "RAISE"; amount: number } | undefined {
  const primary = resolvePrimaryWagerAction(options);
  if (!primary) return undefined;
  return { type: primary, amount };
}
