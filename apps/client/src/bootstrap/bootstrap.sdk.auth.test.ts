import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapSdk } from "@/bootstrap/sdk";

const { authMeMock, setApiBaseUrlMock, setAuthTokenMock } = vi.hoisted(() => ({
  authMeMock: vi.fn(),
  setApiBaseUrlMock: vi.fn(),
  setAuthTokenMock: vi.fn(),
}));

const { preloadSoundsMock, setSoundPlayerMock, createExpoAvPlayerMock } = vi.hoisted(() => ({
  preloadSoundsMock: vi.fn(),
  setSoundPlayerMock: vi.fn(),
  createExpoAvPlayerMock: vi.fn(() => ({ play: vi.fn() })),
}));

const { parseProfileFromMeMock } = vi.hoisted(() => ({
  parseProfileFromMeMock: vi.fn((input) => input),
}));

const { authState, subscribeMock, hydrateTokenMock, logoutMock, markHydratedMock, setProfileMock } = vi.hoisted(() => {
  const state = {
    token: null as string | null,
  };
  return {
    authState: state,
    subscribeMock: vi.fn(),
    hydrateTokenMock: vi.fn(async () => undefined),
    logoutMock: vi.fn(() => {
      state.token = null;
    }),
    markHydratedMock: vi.fn(),
    setProfileMock: vi.fn(),
  };
});

vi.mock("@poker-champ/sdk", () => ({
  SDK_VERSION: "test-sdk",
  setApiBaseUrl: setApiBaseUrlMock,
  setAuthToken: setAuthTokenMock,
  auth: {
    me: authMeMock,
  },
}));

vi.mock("@/lib/sound", () => ({
  preloadSounds: preloadSoundsMock,
  setSoundPlayer: setSoundPlayerMock,
}));

vi.mock("@/lib/soundPlayer", () => ({
  createExpoAvPlayer: createExpoAvPlayerMock,
}));

vi.mock("@/lib/profileFromMe", () => ({
  parseProfileFromMe: parseProfileFromMeMock,
}));

vi.mock("@/constants", () => ({
  DEFAULT_API_URL: "http://localhost:2567",
  PRELOAD_SOUNDS: [],
}));

vi.mock("@/registry/store.registry", () => ({
  storeRegistry: {
    auth: () => ({
      token: authState.token,
      hydrateToken: hydrateTokenMock,
      logout: logoutMock,
      markHydrated: markHydratedMock,
    }),
    profile: () => ({
      setProfile: setProfileMock,
    }),
    use: {
      auth: {
        subscribe: subscribeMock,
      },
    },
  },
}));

describe("bootstrapSdk auth handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.token = null;
  });

  it("logs out when a hydrated token is stale and /auth/me fails", async () => {
    authState.token = "stale-token";
    authMeMock.mockRejectedValueOnce(new Error("Unauthorized"));

    await bootstrapSdk();

    expect(hydrateTokenMock).toHaveBeenCalledTimes(1);
    expect(authMeMock).toHaveBeenCalled();
    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(markHydratedMock).toHaveBeenCalledTimes(1);
  });
});
