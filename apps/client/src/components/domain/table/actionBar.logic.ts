import type { HeroActionOptions } from "@poker-champ/realtime-contract";
import type { ConnectionStatus } from "./table.types";
import { useMemo } from "react";

export type ActionBarConnectionStatus = ConnectionStatus | undefined;

// Default betting increment in cents
// TODO: Make this configurable per table when tournament chips or different currencies are supported
const DEFAULT_BET_INCREMENT = 100;

export type WagerBounds = {
  min: number;
  max: number;
  increment: number;
};

export type NormalizedCapabilities = {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  canWager: boolean;
  canAllIn: boolean;
};

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
  capabilities: NormalizedCapabilities;
  wager?: {
    bounds: WagerBounds;
    primaryVerb: "BET" | "RAISE";
    resolveAmount: (rawCents: number) => number;
    buildPayload: (amountCents: number) => { type: "BET" | "RAISE"; amount: number };
  };
};

export function resolvePrimaryWagerAction(o?: HeroActionOptions): "BET" | "RAISE" | undefined {
  if (!o) return undefined;
  if (o.primaryWagerAction === "BET" || o.primaryWagerAction === "RAISE") return o.primaryWagerAction;
  return undefined;
}

export function buildWagerActionPayload(
  options: HeroActionOptions | undefined,
  amount: number,
): { type: "BET" | "RAISE"; amount: number } | undefined {
  const type = resolvePrimaryWagerAction(options);
  if (!type) return undefined;
  return { type, amount };
}

// Hook for wager calculations to reduce code duplication
export function useWagerCalculations(wager?: ActionContext['wager'], potCents = 0) {
  return useMemo(() => {
    if (!wager) return null;

    const calculateAmount = (fraction: number) => {
      const amount = Math.max(0, Math.floor(potCents * fraction));
      return amount === 0 ? 0 : Math.floor(amount / wager.bounds.increment) * wager.bounds.increment;
    };

    const resolveAmount = (rawCents: number) => {
      const clamped = Math.max(wager.bounds.min, Math.min(rawCents, wager.bounds.max));
      const rounded = Math.floor(clamped / wager.bounds.increment) * wager.bounds.increment;
      return Math.max(wager.bounds.min, rounded);
    };

    return {
      calculateAmount,
      resolveAmount,
    };
  }, [wager, potCents]);
}

export function resolveWagerCents(rawCents: number, bounds: WagerBounds): number {
  const { min, max, increment } = bounds;
  if (max <= 0 || increment <= 0) {
    // Invalid server state - log error but return safe default
    console.error(`Invalid wager bounds: max must be > 0 and increment must be > 0, got max=${max}, increment=${increment}`);
    return 0;
  }
  
  // Clamp to bounds first
  const clamped = Math.max(min, Math.min(rawCents, max));
  
  // Round down to nearest increment, then re-clamp to ensure we don't go below min
  const rounded = Math.floor(clamped / increment) * increment;
  return Math.max(min, rounded);
}

export function normalizeCapabilities(options?: HeroActionOptions): NormalizedCapabilities {
  return {
    canFold: !!options?.canFold,
    canCheck: !!options?.canCheck,
    canCall: !!options?.canCall,
    canWager: !!options?.canBet || !!options?.canRaise, // Server provides canBet/canRaise, primaryVerb determines bet vs raise
    canAllIn: !!options?.canAllIn,
  };
}

function resolveWagerContext(options?: HeroActionOptions): ActionContext["wager"] | undefined {
  const primaryVerb =
    options?.primaryWagerAction === "BET" || options?.primaryWagerAction === "RAISE"
      ? options.primaryWagerAction
      : undefined;

  if (!primaryVerb || options?.minRaiseTo == null || options?.maxRaiseTo == null) {
    return undefined;
  }

  const bounds: WagerBounds = {
    min: Math.min(options.minRaiseTo, options.maxRaiseTo),
    max: options.maxRaiseTo,
    increment: DEFAULT_BET_INCREMENT,
  };

  return {
    bounds,
    primaryVerb,
    resolveAmount: (rawCents: number) => resolveWagerCents(rawCents, bounds),
    buildPayload: (amountCents: number) => ({ type: primaryVerb, amount: amountCents }),
  };
}

export function useWagerContext(options?: HeroActionOptions) {
  return resolveWagerContext(options);
}

function isConnectionBlockingActions(status?: ActionBarConnectionStatus): boolean {
  return status === "RECONNECTING" || status === "DISCONNECTED";
}

/**
 * Hook that provides action context for ActionBar.
 * 
 * capabilities = raw server truth about what actions are possible
 * allowedActions = capabilities gated by UI state (connection, turn, etc.)
 * wager = betting domain logic with bounds and resolution
 */
export function useActionContext(params: {
  isMyTurn: boolean;
  actionOptions?: HeroActionOptions;
  connectionStatus?: ActionBarConnectionStatus;
}): ActionContext {
  return getActionContext(params);
}

export function getActionContext(params: {
  isMyTurn: boolean;
  actionOptions?: HeroActionOptions;
  connectionStatus?: ActionBarConnectionStatus;
}): ActionContext {
  const canActFromServer = params.isMyTurn && !!params.actionOptions;
  const blocked = isConnectionBlockingActions(params.connectionStatus);
  const o = params.actionOptions;

  const capabilities = normalizeCapabilities(o);
  const wager = resolveWagerContext(o);
  const allowedActions = {
    FOLD: canActFromServer && !blocked && capabilities.canFold,
    CHECK: canActFromServer && !blocked && capabilities.canCheck,
    CALL: canActFromServer && !blocked && capabilities.canCall,
    ALL_IN: canActFromServer && !blocked && capabilities.canAllIn,
    WAGER: canActFromServer && !blocked && capabilities.canWager,
  };

  return {
    showActions: canActFromServer,
    showReconnectingOverlay: params.connectionStatus === "RECONNECTING",
    allowedActions,
    capabilities,
    wager,
  };
}
