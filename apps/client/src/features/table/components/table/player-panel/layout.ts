/**
 * Player panel layout – matches Hero Stack (hero-zone) exactly.
 * Single source for avatar, stack, and dealer slot sizing.
 */

export const STACK = Object.freeze({
  GAP: 4,
  /** Space reserved right of content so dealer button in corner doesn’t overlap name. */
  DEALER_SLOT_OFFSET: 12,
} as const);

export const DEALER_BUTTON = Object.freeze({
  SLOT_SIZE: 24,
  /** Tucked in top-right corner; minimal inset so button stays out of content. */
  SLOT_TOP: 2,
  SLOT_RIGHT: 2,
} as const);

export const AVATAR = Object.freeze({
  SIZE: 70,
} as const);

export const IDENTITY = Object.freeze({
  GAP: 6,
} as const);
