import { useMemo } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { Opponent } from "../opponent-strip";

export type ActiveTableNotificationVariant = "default" | "processing" | "waiting";

export interface ActiveTableNotification {
  message: string;
  variant: ActiveTableNotificationVariant;
  showLoadingIndicator?: boolean;
}

// Message pools for different contexts - DRY and easily maintainable
const MESSAGE_POOLS = {
  betweenHands: [
    "Next hand starting soon…",
    "Shuffling up for the next hand…",
    "Ante up! Next hand dealing…",
    "Taking a quick breather between hands…",
    "Getting ready for the next round…",
    "Riffling cards like a pro…",
    "The dealer's doing their magic…",
    "Even the dealer needs a coffee break…",
    "Shuffling up and dealing dreams…",
    "The cards are getting acquainted…",
    "Poker face practice time…",
    "Resetting the poker gods…",
  ],
  waitingForOthers: [
    "Waiting for other players to act…",
    "Thinking time for the opposition…",
    "The table is deciding their moves…",
    "Patience is a virtue in poker…",
    "Let the strategy unfold…",
    "They're probably counting their outs…",
    "The tank is real today…",
    "Someone's doing some serious soul-searching…",
    "Calculating pot odds in their head…",
    "The pressure cooker is simmering…",
    "Good things come to those who wait…",
    "Even Phil Ivey had to wait sometimes…",
    "The suspense is killing me too…",
  ],
  processingAction: [
    "Processing your action…",
    "Your move is being registered…",
    "Good call! Let's see what happens…",
    "Action received, updating the table…",
    "Nice play! Updating the game…",
    "Your poker genius is being processed…",
    "The server agrees with your brilliance…",
    "Transmitting your master plan…",
    "Your move is making waves…",
    "The poker gods have received your offering…",
    "Your decision is echoing through the server…",
  ],
  systemProcessing: [
    "Updating the table state…",
    "Synchronizing with the server…",
    "Just a moment, getting everything ready…",
    "Almost there, finalizing the details…",
    "Syncing up the latest action…",
    "The digital dealer is shuffling bits…",
    "Consulting the poker oracle…",
    "Aligning the poker stars…",
    "The server is taking a quick smoke break…",
    "Updating the matrix of possibilities…",
    "The poker engine is warming up…",
    "Calibrating the card physics…",
  ],
} as const;

// Helper function for random message selection - SRP
function getRandomMessage(pool: readonly string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

// Context-aware message generation - SRP
function getContextualWaitingMessage(opponents: Opponent[]): string | null {
  const activePlayer = opponents.find(o => o.isActive);
  
  if (activePlayer) {
    const contextualMessages = [
      `Waiting for ${activePlayer.name} to act…`,
      `${activePlayer.name} is thinking…`,
      `The pressure's on ${activePlayer.name}…`,
      `${activePlayer.name} has a big decision…`,
      `${activePlayer.name} is in the tank…`,
      `${activePlayer.name} is calculating their outs…`,
      `${activePlayer.name} is channeling their inner poker god…`,
      `${activePlayer.name} is doing some deep soul-searching…`,
      `${activePlayer.name} is probably bluffing… or are they?`,
      `${activePlayer.name} is living their poker movie moment…`,
      `${activePlayer.name} is consulting the poker oracle…`,
      `${activePlayer.name} is having a Phil Hellmuth moment…`,
    ];
    return getRandomMessage(contextualMessages);
  }
  
  return null;
}

// Hand progress context messages - SRP
function getHandProgressMessage(snapshot: TableSnapshotPayload): string | null {
  if (!snapshot.hand) return null;
  
  const streetMessages = {
    WAITING: [
      "Getting ready for the next hand…", 
      "Preparing the table…",
      "The poker gods are gathering…",
      "Anteing up for the next battle…",
      "The cards are resting…",
    ],
    PREFLOP: [
      "Pre-flop action underway…", 
      "First betting round active…",
      "The dance begins pre-flop…",
      "Hole cards are being evaluated…",
      "The pre-flop strategy session…",
    ],
    FLOP: [
      "The flop is out…", 
      "Post-flop strategy time…",
      "Three community cards revealed…",
      "The flop changed everything…",
      "Post-flop poker chess…",
    ],
    TURN: [
      "Turn card revealed…", 
      "Fourth street action…",
      "The turn card has spoken…",
      "Fourth street decisions…",
      "The turn just got serious…",
    ],
    RIVER: [
      "River is here…", 
      "Final betting round…",
      "The river card completes the story…",
      "Fifth street final showdown…",
      "The river makes or breaks…",
    ],
    SHOWDOWN: [
      "Time for the showdown…", 
      "Revealing the hands…",
      "Cards up, let's see who won…",
      "The moment of truth…",
      "Showdown time - no more hiding…",
    ],
  } as const;
  
  const street = snapshot.hand.street;
  const pool = streetMessages[street as keyof typeof streetMessages];
  return pool ? getRandomMessage(pool) : null;
}

// Main notification logic - SRP
function getNotificationType(
  waitingBetweenHands: boolean,
  hasActionOptions: boolean,
  actionContextShowActions: boolean,
  isPendingHeroAction: boolean
): {
  type: 'betweenHands' | 'waitingForOthers' | 'processingAction' | 'systemProcessing';
  variant: ActiveTableNotificationVariant;
  showLoadingIndicator: boolean;
} {
  // Priority 1: Hero just acted (most specific and time-sensitive)
  if (isPendingHeroAction) {
    return {
      type: 'processingAction',
      variant: 'processing',
      showLoadingIndicator: true,
    };
  }
  
  // Priority 2: Between hands (no hand active)
  if (waitingBetweenHands) {
    return {
      type: 'betweenHands',
      variant: 'default',
      showLoadingIndicator: false,
    };
  }
  
  // Priority 3: System not ready (UI sync issues)
  if (!actionContextShowActions) {
    return {
      type: 'systemProcessing',
      variant: 'processing',
      showLoadingIndicator: true,
    };
  }
  
  // Priority 4: Waiting for others (hand active, not hero's turn)
  if (!hasActionOptions) {
    return {
      type: 'waitingForOthers',
      variant: 'waiting',
      showLoadingIndicator: false,
    };
  }
  
  // Fallback (shouldn't reach here in normal flow)
  return {
    type: 'systemProcessing',
    variant: 'processing',
    showLoadingIndicator: false,
  };
}

/**
 * Hook for providing intelligent, context-aware notifications during active table states.
 * 
 * Replaces generic "Waiting for next hand…" messages with specific, informative feedback
 * based on the actual game state and context.
 * 
 * @param waitingBetweenHands - No active hand, between hands
 * @param hasActionOptions - Hero has available actions (it's hero's turn)
 * @param actionContextShowActions - UI is ready to show actions
 * @param isPendingHeroAction - Hero just submitted an action, waiting for server
 * @param opponents - List of opponent players for contextual messages
 * @param snapshot - Current table snapshot for hand progress context
 * 
 * @returns Object with message, visual variant, and loading indicator preference
 * 
 * @example
 * ```tsx
 * const notification = useActiveTableNotification(
 *   !snapshot.hand,
 *   !!heroActionOptions,
 *   actionContext.showActions,
 *   isPendingHeroAction,
 *   opponents,
 *   snapshot
 * );
 * ```
 */
export function useActiveTableNotification(
  waitingBetweenHands: boolean,
  hasActionOptions: boolean,
  actionContextShowActions: boolean,
  isPendingHeroAction: boolean,
  opponents: Opponent[] = [],
  snapshot?: TableSnapshotPayload,
): ActiveTableNotification {
  return useMemo(() => {
    const { type, variant, showLoadingIndicator } = getNotificationType(
      waitingBetweenHands,
      hasActionOptions,
      actionContextShowActions,
      isPendingHeroAction
    );

    let message: string;

    // Handle contextual messages for waiting state
    if (type === 'waitingForOthers') {
      // Priority 1: Show active player name
      const contextualMessage = getContextualWaitingMessage(opponents);
      if (contextualMessage) {
        return { message: contextualMessage, variant, showLoadingIndicator };
      }
      
      // Priority 2: Show hand progress if available
      if (snapshot) {
        const progressMessage = getHandProgressMessage(snapshot);
        if (progressMessage) {
          return { message: progressMessage, variant, showLoadingIndicator };
        }
      }
    }

    // Use message pools for standard cases
    if (type in MESSAGE_POOLS) {
      message = getRandomMessage(MESSAGE_POOLS[type]);
    } else {
      // Ultimate fallback
      message = "Getting ready…";
    }

    return {
      message,
      variant,
      showLoadingIndicator,
    };
  }, [
    waitingBetweenHands,
    hasActionOptions,
    actionContextShowActions,
    isPendingHeroAction,
    opponents,
    snapshot,
  ]);
}
