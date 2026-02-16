import { describe, expect, it } from "vitest";
import { canStartRealtimeSession } from "@/realtime/useRealtimeChannel";

type Tick = {
  t: number;
  authHydrated: boolean;
  authToken: string | null;
};

function runHarness(ticks: Tick[]) {
  let socketConnectAttemptCountPreHydration = 0;
  let pokerJoinAttemptCountPreHydration = 0;
  let socketConnectAttemptCountPostHydration = 0;

  for (const tick of ticks) {
    const canConnect = canStartRealtimeSession({
      scope: "table",
      enabled: true,
      authHydrated: tick.authHydrated,
      authToken: tick.authToken,
    });

    if (!canConnect) continue;

    // In table transport, connect implies we are allowed to attempt table join.
    if (!tick.authHydrated) {
      socketConnectAttemptCountPreHydration += 1;
      pokerJoinAttemptCountPreHydration += 1;
    } else {
      socketConnectAttemptCountPostHydration += 1;
    }
  }

  return {
    socketConnectAttemptCountPreHydration,
    pokerJoinAttemptCountPreHydration,
    socketConnectAttemptCountPostHydration,
  };
}

describe("client pre-hydration realtime invariants harness", () => {
  it("prevents socket and join attempts before hydration, then allows after hydration", () => {
    const result = runHarness([
      { t: 0, authHydrated: false, authToken: null },
      { t: 1, authHydrated: false, authToken: "token_loaded_late" },
      { t: 2, authHydrated: false, authToken: "token_loaded_late" },
      { t: 3, authHydrated: true, authToken: "token_loaded_late" },
      { t: 4, authHydrated: true, authToken: "token_loaded_late" },
    ]);

    expect(result.socketConnectAttemptCountPreHydration).toBe(0);
    expect(result.pokerJoinAttemptCountPreHydration).toBe(0);
    expect(result.socketConnectAttemptCountPostHydration).toBeGreaterThan(0);
  });

  it("keeps both counts at zero when hydration finishes without token", () => {
    const result = runHarness([
      { t: 0, authHydrated: false, authToken: null },
      { t: 1, authHydrated: false, authToken: null },
      { t: 2, authHydrated: true, authToken: null },
      { t: 3, authHydrated: true, authToken: null },
    ]);

    expect(result.socketConnectAttemptCountPreHydration).toBe(0);
    expect(result.pokerJoinAttemptCountPreHydration).toBe(0);
    expect(result.socketConnectAttemptCountPostHydration).toBe(0);
  });
});
