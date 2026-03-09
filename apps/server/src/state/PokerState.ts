import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";
import { PlayerState } from "./PlayerState.js";

export type Street = "WAITING" | "PREFLOP" | "FLOP" | "TURN" | "RIVER" | "SHOWDOWN";
export type RunoutMode = "NONE" | "STAGED";

export class PokerState extends Schema {
  @type("string") tableId: string = "";
  @type("string") tableName: string = "Hold'em";
  @type("string") creatorId: string = "";
  @type("string") visibility: "PUBLIC" | "PRIVATE" = "PUBLIC";
  @type("string") speed: "normal" | "fast" = "normal";

  /** Seat capacity for this table (2..10). */
  @type("number") maxSeats: number = 9;

  /** Creation timestamp used by lobby listing. */
  @type("number") createdAtTs: number = 0;

  /** Set when a hand begins; used by lobby "running since". */
  @type("number") runningSinceTs: number = 0;

  @type("string") handId: string = "";
  @type("number") handNumber: number = 0;
  @type("number") handActionSeq: number = 0;
  @type("number") actionCount: number = 0;
  @type("number") initialChipMassCents: number = 0;
  @type("number") nextHandAtTs: number = 0;
  @type("string") street: Street = "WAITING";
  @type("string") runoutMode: RunoutMode = "NONE";

  @type("number") dealerSeat: number = 0;
  @type("number") sbSeat: number = 0;
  @type("number") bbSeat: number = 0;
  @type("number") toActSeat: number = 0;

  @type("number") smallBlindCents: number = 50;
  @type("number") bigBlindCents: number = 100;
  @type("number") minBuyInCents: number = 2000;
  @type("number") maxBuyInCents: number = 20000;
  @type("boolean") showStats: boolean = false;

  /**
   * Total contributed pot size for the hand (Pattern B).
   * This is not decremented during payout/refund; SettlementService tracks
   * disbursed credits separately for conservation checks.
   */
  @type("number") potCents: number = 0;

  /** Highest `roundBetCents` among eligible players this betting round. */
  @type("number") roundCurrentBetCents: number = 0;

  /** Min raise increment for current betting round (NLHE). */
  @type("number") minRaiseCents: number = 0;

  @type(["string"]) board: ArraySchema<string> = new ArraySchema<string>();

  @type({ map: PlayerState }) playersById: MapSchema<PlayerState> = new MapSchema<PlayerState>();
  @type(["string"]) seats: ArraySchema<string> = new ArraySchema<string>();
}
