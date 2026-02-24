export type SoundEvent =
  | "ui.tap"
  | "ui.modalOpen"
  | "ui.modalClose"
  | "voice.toggle"
  | "table.action.fold"
  | "table.action.check"
  | "table.action.call"
  | "table.action.bet"
  | "table.action.raise"
  | "table.action.allIn"
  | "table.handStart"
  | "table.boardReveal"
  | "table.heroTurn"
  | "table.potWin"
  | "table.handReveal"
  | "table.notificationBell"
  | "app.toast"
  | "app.error"
  | "table.reconnectStart"
  | "table.reconnectSuccess"
  | "table.reconnectFail";

export const SOUND_EVENT_COOLDOWN_MS: Partial<Record<SoundEvent, number>> = {
  "ui.tap": 60,
  "ui.modalOpen": 120,
  "ui.modalClose": 120,
  "voice.toggle": 60,
  "table.action.fold": 120,
  "table.action.check": 100,
  "table.action.call": 100,
  "table.action.bet": 100,
  "table.action.raise": 120,
  "table.action.allIn": 180,
  "table.handStart": 200,
  "table.boardReveal": 60,
  "table.heroTurn": 200,
  "table.potWin": 200,
  "table.handReveal": 120,
  "table.notificationBell": 180,
  "app.toast": 120,
  "app.error": 200,
  "table.reconnectStart": 300,
  "table.reconnectSuccess": 300,
  "table.reconnectFail": 300,
};
