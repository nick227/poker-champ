import { Schema, type } from "@colyseus/schema";

export type PlayerStatus = "WAITING" | "ACTIVE" | "FOLDED" | "ALL_IN" | "ABANDONED" | "OUT";
export type PlayerKind = "HUMAN" | "BOT";

export class PlayerState extends Schema {
  @type("string") id!: string;
  /** Authenticated user id; empty string for bots (Colyseus schema does not support null). */
  @type("string") userId: string = "";
  @type("string") kind: PlayerKind = "HUMAN";
  /** Character id for bots (catalog key); empty for humans. */
  @type("string") botId: string = "";
  @type("string") name: string = "";

  @type("number") seat: number = -1;
  @type("string") status: PlayerStatus = "WAITING";

  @type("number") stackCents: number = 10000;

  /** Amount committed in current betting round (resets each street). */
  @type("number") roundBetCents: number = 0;

  /** Amount committed for entire hand (used by side-pots). */
  @type("number") committedCents: number = 0;

  /** Whether player still needs to respond to current bet level this round. */
  @type("boolean") needsAction: boolean = false;

  /** True after the player takes a betting action this street (blind posts do not set this). */
  @type("boolean") hasActedThisStreet: boolean = false;

  /** Connection state for reconnect grace handling. */
  @type("boolean") connected: boolean = true;

  /** Epoch millis deadline for reconnect grace. 0 means none. */
  @type("number") disconnectDeadlineTs: number = 0;

  /** True when player joined mid-hand; cleared on next startHand so they are dealt in next hand only. */
  @type("boolean") sittingOutUntilNextHand: boolean = false;

  /** True when removal was requested during an active hand and must be finalized at a safe boundary. */
  @type("boolean") pendingLeave: boolean = false;

  /** Reason string for deferred lifecycle removal. */
  @type("string") pendingRemovalReason: string = "";
}
