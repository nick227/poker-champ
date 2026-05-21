import { describe, expect, it } from "vitest";
import { assertTournamentCancelAllowed } from "./tournament-cancel-auth.js";
import {
  TOURNAMENT_CANCEL_FORBIDDEN,
  TOURNAMENT_HAS_REGISTRATIONS,
  TOURNAMENT_NOT_CANCELLABLE,
} from "./tournament.errors.js";

describe("assertTournamentCancelAllowed", () => {
  const base = {
    tournament: { status: "REGISTERING", createdByUserId: "creator_1" },
    registeredCount: 0,
    userId: "creator_1",
    userRole: "USER",
  };

  it("allows creator to cancel empty registering tournament", () => {
    expect(() => assertTournamentCancelAllowed(base)).not.toThrow();
  });

  it("allows admin to cancel with registrations", () => {
    expect(() =>
      assertTournamentCancelAllowed({
        ...base,
        registeredCount: 3,
        userId: "admin_1",
        userRole: "ADMIN",
      }),
    ).not.toThrow();
  });

  it("rejects non-creator non-admin", () => {
    expect(() =>
      assertTournamentCancelAllowed({ ...base, userId: "other" }),
    ).toThrow(TOURNAMENT_CANCEL_FORBIDDEN);
  });

  it("rejects creator cancel when registrations exist", () => {
    expect(() =>
      assertTournamentCancelAllowed({ ...base, registeredCount: 1 }),
    ).toThrow(TOURNAMENT_HAS_REGISTRATIONS);
  });

  it("rejects creator cancel when not registering", () => {
    expect(() =>
      assertTournamentCancelAllowed({
        ...base,
        tournament: { status: "RUNNING", createdByUserId: "creator_1" },
      }),
    ).toThrow(TOURNAMENT_NOT_CANCELLABLE);
  });
});
