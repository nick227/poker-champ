import { useMemo } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { Opponent } from "../OpponentStrip";

export interface EmptyTableNotificationAction {
  title: string;
  onPress: () => void;
  variant?: "primary" | "ghost" | "danger" | "link";
}

export interface EmptyTableNotification {
  message: string;
  actions?: EmptyTableNotificationAction[];
}

export function useEmptyTableNotification(
  snapshot: TableSnapshotPayload,
  opponents: Opponent[],
  onAddBot?: () => void,
  onInvitePlayer?: () => void,
  onResumeGame?: () => void,
  isHost?: boolean,
): EmptyTableNotification {
  return useMemo(() => {
    const activeBots = opponents.filter((o) => o.isBot && o.stackCents > 0);
    const bustedBots = opponents.filter((o) => o.isBot && o.stackCents === 0);
    const activeHumans = opponents.filter((o) => !o.isBot && o.stackCents > 0);
    const heroIsSeated = snapshot.hero.youAreSeated;

    // All bots busted scenario
    if (bustedBots.length > 0 && activeBots.length === 0 && activeHumans.length === 0 && heroIsSeated) {
      const actions: EmptyTableNotificationAction[] = [];
      
      if (onAddBot) {
        actions.push({
          title: "Add Bot",
          onPress: onAddBot,
          variant: "primary",
        });
      }
      
      if (onInvitePlayer) {
        actions.push({
          title: "Invite Player",
          onPress: onInvitePlayer,
          variant: "ghost",
        });
      }

      const bustedMessages = [
        "All bots are out of chips. Add a new bot or invite a player to continue.",
        "The bots have been vanquished! Time to bring in fresh blood.",
        "Bot graveyard detected. Add new opponents or invite friends.",
        "The AI has learned its lesson. Bring in new challengers!",
        "All bots busted! Even the machines need a break sometimes.",
        "The bot massacre is complete. Ready for round two?",
      ];

      return {
        message: bustedMessages[Math.floor(Math.random() * bustedMessages.length)],
        actions: actions.length > 0 ? actions : undefined,
      };
    }

    // Hero only player scenario
    if (opponents.length === 0 && heroIsSeated) {
      const actions: EmptyTableNotificationAction[] = [];
      
      if (onAddBot) {
        actions.push({
          title: "Add Bot",
          onPress: onAddBot,
          variant: "primary",
        });
      }
      
      if (onInvitePlayer) {
        actions.push({
          title: "Invite Player",
          onPress: onInvitePlayer,
          variant: "ghost",
        });
      }

      const soloMessages = [
        "You're the only player at the table. Add bots or invite friends to play.",
        "Solo poker champion? Add some opponents to test your skills.",
        "The table is lonely. Bring in some competition!",
        "Even the Lone Ranger had Tonto. Add some players!",
        "Poker by yourself is just... expensive card sorting.",
        "You're the king of an empty castle. Time to populate the kingdom!",
      ];

      return {
        message: soloMessages[Math.floor(Math.random() * soloMessages.length)],
        actions: actions.length > 0 ? actions : undefined,
      };
    }

    // Waiting for more players
    if (heroIsSeated && opponents.length < (snapshot.table.maxSeats - 1)) {
      const actions: EmptyTableNotificationAction[] = [];
      
      if (onAddBot) {
        actions.push({
          title: "Add Bot",
          onPress: onAddBot,
          variant: "primary",
        });
      }
      
      if (onInvitePlayer) {
        actions.push({
          title: "Invite Player",
          onPress: onInvitePlayer,
          variant: "ghost",
        });
      }

      if (actions.length > 0) {
        const waitingMessages = [
          "Waiting for more players to join the game.",
          "The more the merrier! Invite some friends to the game.",
          "Poker is better with more people. Add some players!",
          "Building a poker empire, one player at a time...",
          "The table's feeling a bit empty. Let's fill it up!",
          "Good things come to those who wait... but poker's better with more players!",
        ];

        return {
          message: waitingMessages[Math.floor(Math.random() * waitingMessages.length)],
          actions,
        };
      }
    }

    // Default fallback
    return {
      message: "Next hand starting soon…",
    };
  }, [snapshot, opponents, onAddBot, onInvitePlayer]);
}
