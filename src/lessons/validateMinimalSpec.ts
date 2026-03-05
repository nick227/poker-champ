/**
 * Structural validation for minimal hand spec.
 * Run before engine projection. Does not validate poker rules (engine does that).
 */

import type { MinimalHandSpec, SpecAction, Street } from "./minimalHandSpec.types.js";
import { STREET_ORDER, BOARD_LENGTH_BY_STREET } from "./minimalHandSpec.types.js";

const SUPPORTED_SPEC_VERSION = 1;

export type ValidationError = { path?: string; message: string };

export function validateMinimalSpec(spec: unknown): ValidationError[] {
  const errs: ValidationError[] = [];

  if (!spec || typeof spec !== "object") {
    return [{ message: "Spec must be an object" }];
  }

  const s = spec as Record<string, unknown>;

  if (s.specVersion !== SUPPORTED_SPEC_VERSION) {
    errs.push({ path: "specVersion", message: `Unsupported specVersion: ${s.specVersion}. Supported: ${SUPPORTED_SPEC_VERSION}` });
  }
  if (typeof s.lessonTitle !== "string" || !s.lessonTitle.trim()) {
    errs.push({ path: "lessonTitle", message: "lessonTitle is required and must be non-empty" });
  }
  if (typeof s.players !== "number" || s.players < 2 || s.players > 9) {
    errs.push({ path: "players", message: "players must be 2–9" });
  }

  const playersInfo = s.playersInfo;
  if (!Array.isArray(playersInfo) || playersInfo.length !== (s.players as number)) {
    errs.push({ path: "playersInfo", message: `playersInfo must be an array of length ${s.players}` });
  } else {
    const seats = new Set<number>();
    const positions = new Set<string>();
    for (let i = 0; i < playersInfo.length; i++) {
      const p = playersInfo[i] as Record<string, unknown>;
      if (typeof p?.seat !== "number" || p.seat < 1 || p.seat > 9) {
        errs.push({ path: `playersInfo[${i}].seat`, message: "seat must be 1–9" });
      } else {
        if (seats.has(p.seat)) errs.push({ path: `playersInfo[${i}].seat`, message: "duplicate seat" });
        seats.add(p.seat);
      }
      if (typeof p?.position !== "string") {
        errs.push({ path: `playersInfo[${i}].position`, message: "position is required" });
      } else if (positions.has(p.position)) {
        errs.push({ path: `playersInfo[${i}].position`, message: "duplicate position" });
      } else {
        positions.add(p.position);
      }
    }

    const heroSeat = s.heroSeat;
    if (typeof heroSeat !== "number") {
      errs.push({ path: "heroSeat", message: "heroSeat is required" });
    } else if (!seats.has(heroSeat)) {
      errs.push({ path: "heroSeat", message: "heroSeat must appear exactly once in playersInfo" });
    } else {
      const heroCount = playersInfo.filter((p: { seat: number }) => p.seat === heroSeat).length;
      if (heroCount !== 1) {
        errs.push({ path: "heroSeat", message: "heroSeat must appear exactly once in playersInfo" });
      }
    }
  }

  const blinds = s.blinds;
  if (!blinds || typeof blinds !== "object") {
    errs.push({ path: "blinds", message: "blinds is required" });
  } else {
    const b = blinds as Record<string, unknown>;
    if (typeof b.bb !== "number" || b.bb <= 0) errs.push({ path: "blinds.bb", message: "blinds.bb must be > 0" });
    if (typeof b.sb !== "number" || b.sb <= 0) errs.push({ path: "blinds.sb", message: "blinds.sb must be > 0" });
    if (typeof b.sb === "number" && typeof b.bb === "number" && b.sb >= b.bb) {
      errs.push({ path: "blinds", message: "blinds.sb must be < blinds.bb" });
    }
  }

  if (typeof s.startingStacksBB !== "number" || s.startingStacksBB < 1) {
    errs.push({ path: "startingStacksBB", message: "startingStacksBB must be >= 1" });
  }

  const heroHoleCards = s.heroHoleCards;
  if (!Array.isArray(heroHoleCards) || heroHoleCards.length !== 2) {
    errs.push({ path: "heroHoleCards", message: "heroHoleCards must be exactly two cards" });
  } else {
    const cardSet = new Set(heroHoleCards as string[]);
    if (cardSet.size !== 2) errs.push({ path: "heroHoleCards", message: "heroHoleCards must be unique" });
  }

  const board = s.board;
  if (!Array.isArray(board) || board.length > 5) {
    errs.push({ path: "board", message: "board must be an array of 0–5 cards" });
  } else {
    const boardSet = new Set(board as string[]);
    if (boardSet.size !== board.length) errs.push({ path: "board", message: "board cards must be unique" });
  }

  const heroCards = new Set((heroHoleCards as string[]) || []);
  const boardCards = new Set((board as string[]) || []);
  for (const c of heroCards) {
    if (boardCards.has(c)) errs.push({ path: "board", message: "heroHoleCards and board must be disjoint" });
  }

  const actions = s.actions;
  if (!Array.isArray(actions) || actions.length < 1) {
    errs.push({ path: "actions", message: "actions must have at least one action" });
  } else if (actions.length > 40) {
    errs.push({ path: "actions", message: "actions must have at most 40 items" });
  } else {
    let prevStreet: Street | null = null;
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i] as Record<string, unknown>;
      if (typeof a?.street !== "string" || !STREET_ORDER.includes(a.street as Street)) {
        errs.push({ path: `actions[${i}].street`, message: "street must be PREFLOP, FLOP, TURN, or RIVER" });
      }
      if (typeof a?.actorSeat !== "number" || a.actorSeat < 1 || a.actorSeat > 9) {
        errs.push({ path: `actions[${i}].actorSeat`, message: "actorSeat must be 1–9" });
      }
      const actionKind = a?.action as string;
      if (!["FOLD", "CHECK", "CALL", "BET", "RAISE", "ALL_IN"].includes(actionKind)) {
        errs.push({ path: `actions[${i}].action`, message: "action must be FOLD, CHECK, CALL, BET, RAISE, or ALL_IN" });
      }
      if ((a?.sizeBB != null && a?.sizePot != null)) {
        errs.push({ path: `actions[${i}]`, message: "only one of sizeBB or sizePot may be set" });
      }
      const street = prevStreet ?? (a.street as Street);
      if (prevStreet && STREET_ORDER.indexOf(a.street as Street) < STREET_ORDER.indexOf(prevStreet)) {
        errs.push({ path: `actions[${i}].street`, message: "actions must be sorted by street" });
      }
      prevStreet = a.street as Street;
    }

    const heroSeatVal = s.heroSeat as number;
    const heroDecisionCount = (actions as SpecAction[]).filter(
      (a) => a.isHeroDecision === true || a.actorSeat === heroSeatVal,
    ).length;
    if (heroDecisionCount < 1) {
      errs.push({ path: "actions", message: "at least one hero decision required (actorSeat === heroSeat or isHeroDecision: true)" });
    }
  }

  const maxStreetReached = maxStreetFromActions((actions as SpecAction[]) || []);
  if (maxStreetReached && Array.isArray(board)) {
    const requiredLen = BOARD_LENGTH_BY_STREET[maxStreetReached];
    if (board.length < requiredLen) {
      errs.push({ path: "board", message: `board length must be >= ${requiredLen} for street ${maxStreetReached}` });
    }
  }

  return errs;
}

function maxStreetFromActions(actions: SpecAction[]): Street | null {
  let max: Street | null = null;
  for (const a of actions) {
    if (!max || STREET_ORDER.indexOf(a.street) > STREET_ORDER.indexOf(max)) max = a.street;
  }
  return max;
}

export function validateMinimalSpecOrThrow(spec: unknown): asserts spec is MinimalHandSpec {
  const errs = validateMinimalSpec(spec);
  if (errs.length > 0) {
    const msg = errs.map((e) => `${e.path ?? "spec"}: ${e.message}`).join("; ");
    throw new Error(`Invalid spec: ${msg}`);
  }
}
