/** Centralized UI copy to avoid magic strings. */

export const APP_NAME = "Poker Champ";

export const LOADING_MESSAGES = [
  "Shuffling deck...",
  "Dealing cards...",
  "Good luck at the tables!",
  "May the odds be in your favor.",
] as const;

export const MODAL = {
  close: "Close",
  chat: "Chat",
  createGame: "Create Game",
  chooseTable: "Choose Table",
  rebuy: "Rebuy",
  activeTables: "Active Tables",
} as const;

export const CHAT = {
  placeholder: "Message",
  empty: "No messages yet.",
} as const;

export const TOURNAMENT = {
  create: "Create tournament",
} as const;

export const TABLE = {
  yourTurn: "Your turn",
  wins: "wins",
  deal: "Deal",
  fold: "Fold",
  sittingOut: "Sitting out",
  sitOut: "Sit out",
  rejoin: "Rejoin",
  bankroll: "Bankroll",
  sort: "Sort",
  createGame: "New Game",
  defaultTableName: "Table",
  nextDeal: "Next deal:",
  reconnecting: "Reconnecting…",
  tableGone: "Table no longer exists",
  waitingForHand: "",
  waitingForHandStatus: "Status: ",
  waitingForYourTurn: "Waiting for your turn",
  youFolded: "You folded this hand",
  youAreAllIn: "You are all-in",
  check: "Check",
  bet: "Bet",
  raise: "Raise",
  allIn: "ALL IN",
  min: "MIN",
  halfPot: "1/2",
  pot: "POT",
  max: "MAX",
  betRaise: "Bet",
} as const;

export const PASSWORD_INPUT = {
  show: "Show",
  hide: "Hide",
} as const;
