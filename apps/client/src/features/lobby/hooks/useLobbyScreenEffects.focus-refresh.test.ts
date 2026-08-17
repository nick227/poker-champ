/**
 * @vitest-environment happy-dom
 */
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { focusCallbacks } = vi.hoisted(() => ({
  focusCallbacks: [] as Array<() => void | (() => void)>,
}));

vi.mock("@react-navigation/native", () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    focusCallbacks.push(callback);
  },
}));

vi.mock("@/features/lobby/hooks/useTournamentStartLobbyEffects", () => ({
  useTournamentStartLobbyEffects: () => {},
}));

import { useLobbyScreenEffects } from "@/features/lobby/hooks/useLobbyScreenEffects";

function fireLatestFocus() {
  const latest = focusCallbacks[focusCallbacks.length - 1];
  latest?.();
}

describe("useLobbyScreenEffects focus-triggered refresh", () => {
  afterEach(() => {
    focusCallbacks.length = 0;
    vi.restoreAllMocks();
  });

  it("does not refetch on the very first focus (mount already fetched)", () => {
    const refresh = vi.fn();
    const refreshTournaments = vi.fn();

    renderHook(() =>
      useLobbyScreenEffects({
        authHydrated: true,
        authToken: "token",
        refresh,
        refreshTournaments,
        tournamentList: [],
        isDesktopWorkspace: false,
        onTournamentCancelled: () => {},
      }),
    );

    refresh.mockClear();
    refreshTournaments.mockClear();
    fireLatestFocus();

    expect(refresh).not.toHaveBeenCalled();
    expect(refreshTournaments).not.toHaveBeenCalled();
  });

  it("refetches the authoritative per-viewer snapshot on a later focus (returning from a table)", () => {
    const refresh = vi.fn();
    const refreshTournaments = vi.fn();

    renderHook(() =>
      useLobbyScreenEffects({
        authHydrated: true,
        authToken: "token",
        refresh,
        refreshTournaments,
        tournamentList: [],
        isDesktopWorkspace: false,
        onTournamentCancelled: () => {},
      }),
    );

    refresh.mockClear();
    refreshTournaments.mockClear();
    // First focus after mount is skipped (see above); the second models the user coming back
    // from the table screen after joining or leaving a table.
    fireLatestFocus();
    fireLatestFocus();

    expect(refresh).toHaveBeenCalledWith({ background: true });
    expect(refreshTournaments).toHaveBeenCalledWith({ background: true });
  });

  it("does not refetch on focus before auth has hydrated", () => {
    const refresh = vi.fn();
    const refreshTournaments = vi.fn();

    renderHook(() =>
      useLobbyScreenEffects({
        authHydrated: false,
        authToken: null,
        refresh,
        refreshTournaments,
        tournamentList: [],
        isDesktopWorkspace: false,
        onTournamentCancelled: () => {},
      }),
    );

    refresh.mockClear();
    refreshTournaments.mockClear();
    fireLatestFocus();
    fireLatestFocus();

    expect(refresh).not.toHaveBeenCalled();
    expect(refreshTournaments).not.toHaveBeenCalled();
  });
});
