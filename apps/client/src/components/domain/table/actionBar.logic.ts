import type { HeroActionOptions } from "@poker-champ/realtime-contract";
import type { ConnectionStatus } from "./table.types";

export type ActionBarConnectionStatus = ConnectionStatus | undefined;

export type ActionContext = {
  showActions: boolean;
  showReconnectingOverlay: boolean;
  allowedActions: {
    FOLD: boolean;
    CHECK: boolean;
    CALL: boolean;
    ALL_IN: boolean;
    WAGER: boolean;
  };
};

export function resolvePrimaryWagerAction(o?: HeroActionOptions): "BET" | "RAISE" | undefined {
  if (!o) return undefined;
  if (o.primaryWagerAction === "BET" || o.primaryWagerAction === "RAISE") return o.primaryWagerAction;
  return undefined;
}

function isConnectionBlockingActions(status?: ActionBarConnectionStatus): boolean {
  return status === "RECONNECTING" || status === "DISCONNECTED";
}

export function getActionContext(params: {
  isMyTurn: boolean;
  actionOptions?: HeroActionOptions;
  connectionStatus?: ActionBarConnectionStatus;
}): ActionContext {
  const canActFromServer = params.isMyTurn && !!params.actionOptions;
  const blocked = isConnectionBlockingActions(params.connectionStatus);
  const o = params.actionOptions;

  return {
    showActions: canActFromServer,
    showReconnectingOverlay: params.connectionStatus === "RECONNECTING",
    allowedActions: {
      FOLD: canActFromServer && !blocked && !!o?.canFold,
      CHECK: canActFromServer && !blocked && !!o?.canCheck,
      CALL: canActFromServer && !blocked && !!o?.canCall,
      ALL_IN: canActFromServer && !blocked && !!o?.canAllIn,
      WAGER: canActFromServer && !blocked && !!resolvePrimaryWagerAction(o),
    },
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
